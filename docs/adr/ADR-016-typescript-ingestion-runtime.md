# ADR-016: TypeScript for Opportunity Ingestion (Supersedes ADR-003)

**Status**: Proposed — supersedes [ADR-003](ADR-003-python-ingestion-pipeline.md) for the
ingestion/normalization/scoring scope defined below. Not yet implemented; no ingestion code exists
in this repository as of this ADR.

**Supersedes**: [ADR-003](ADR-003-python-ingestion-pipeline.md) (Python ingestion pipeline),
narrowed to the scope stated in "What this does not decide" below.

## Context

[ADR-003](ADR-003-python-ingestion-pipeline.md) chose Python for "the entire
ingestion/parsing/scoring codebase," reasoning from three workloads together: source-adapter
ingestion, resume parsing (PDF/DOCX extraction), and scoring/aggregation (pandas, future
embeddings). That ADR was written before any of the three existed and before the execution-model
question was examined in detail (see [ADR-017](ADR-017-local-first-ingestion-execution.md)).

Phase 2A implements only the first of those three workloads. Its actual, concrete task list is:

- fetch structured JSON (Greenhouse) over HTTPS,
- validate the response shape at runtime,
- normalize into the common opportunity schema ([DATA_MODEL.md](../DATA_MODEL.md)),
- sanitize HTML descriptions,
- compute a content hash for idempotent change detection,
- upsert through a trusted database client (Supabase service-role),
- report structured, capped run results ([OBSERVABILITY.md](../OBSERVABILITY.md)).

None of this is PDF/DOCX extraction, dataframe aggregation, or embeddings — the specific
capabilities ADR-003 cited as Python's advantage. Meanwhile, [ADR-017](ADR-017-local-first-ingestion-execution.md)
identifies the two realistic **hosted** execution targets for this project's later, cost-conscious
architecture as **Supabase Edge Functions (Deno)** and **Cloudflare Workers** — both TypeScript
runtimes, neither of which runs Python without a container, which reintroduces the always-on-host
cost [ADR-002](ADR-002-frontend-and-backend-boundaries.md) and
[ADR-009](ADR-009-zero-cost-mvp-deployment.md) already reject.

## Decision

Use **TypeScript** for Phase 2A ingestion: source adapters, normalization, sanitization, hashing,
upsert orchestration, and the deterministic market-relevance scoring introduced in Phase 2A.2. This
code lives in `ingestion/` as a second, independent Node project (its own `package.json` and
lockfile), run today as a local CLI (see [ADR-017](ADR-017-local-first-ingestion-execution.md)).

### Why TypeScript now

1. **One language and contract ecosystem with the existing application.** The opportunity
   taxonomies that must stay in lockstep between ingestion and the frontend —
   `opportunity_kind`, `employment_type`, `remote_mode`, relevance rule identifiers — are shared
   `const`/type definitions in one language instead of a duplicated list maintained in two.
2. **Direct reuse of normalized domain types and validation schemas where safe.** The
   `OpportunityVersion`-shaped type the adapter produces can be the same type the frontend imports
   for read-side rendering, without a schema translation step. This is reuse of *types*, not a
   shared runtime — `app/` and `ingestion/` remain separately deployable, with the Postgres schema
   as the actual contract between them, matching the existing repository's monorepo-without-shared-
   package convention.
3. **A natural path to a local Node CLI immediately, with no new toolchain.** Node 22 is already
   pinned (`.nvmrc`, `app/package.json` `engines`) and already exercised in CI
   (`actions/setup-node`). `ingestion/` reuses that same pin.
4. **Compatibility with the realistic future hosted execution targets.** Per
   [ADR-017](ADR-017-local-first-ingestion-execution.md), the next execution stage after local-CLI
   is a **Supabase Edge Function** (Deno/TypeScript) or a **Cloudflare Worker** — both run
   TypeScript/JavaScript natively. Choosing TypeScript now means the adapter code that gets written
   for the local CLI is largely the code that runs there later, rather than a rewrite.
5. **Less immediate toolchain and CI overhead.** A Python addition would require a second
   interpreter pin, a second package manager and lockfile, a second linter/formatter/type-checker,
   and a second CI job with none of that infrastructure already in place. TypeScript adds one more
   `npm` project next to one that already exists, reusing `eslint`, `prettier`, `vitest`, and
   `typescript` at the same pinned major versions as `app/`.
6. **The workload genuinely does not need Python's stated advantages.** ADR-003's own rationale —
   HTML parsing/sanitization maturity, PDF/DOCX extraction, pandas aggregation, future NLP/embeddings
   — describes Phase 1B resume parsing and Phase 6 market aggregation, not fetch-normalize-hash-
   upsert against a well-documented JSON API. `sanitize-html` (npm) is a mature, actively maintained
   equivalent to Python's HTML-sanitization libraries for this specific task.

### What this does not decide

This ADR is scoped to **opportunity ingestion and deterministic opportunity scoring only**. It does
**not** declare that all future backend or data-processing work must use TypeScript, and it does
**not** reopen or resolve:

- **Phase 1B resume parsing** (PDF/DOCX structured extraction) — remains an open, separate decision
  per [ADR-011](ADR-011-manual-profile-before-resume-extraction.md) and
  [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md). Python (`pdfminer.six`, `spaCy`, or similar) remains
  the natural candidate there and may still be chosen, on its own merits, when that phase is
  actually planned — not as a consequence of this ADR.
- **Phase 6 market-skill aggregation** or any future data-science-shaped batch analysis.
- **Any future machine-learning or embeddings work.**
- **Any future Python-specific workload** this project takes on for reasons unrelated to ingestion.

Per the project's own constraint against selecting a language "merely because future AI work may
use \[it\]," this ADR applies that principle in both directions: TypeScript is chosen here for what
Phase 2A ingestion concretely is, not as a bet against Python generally, and Python was not rejected
here for what a *different*, later phase might need.

## Alternatives considered

- **Python local ingestion** (ADR-003 as originally scoped): keeps the pipeline in the language
  ADR-003 anticipated eventually sharing with resume parsing and scoring/aggregation. Rejected for
  Phase 2A specifically because that sharing benefit is speculative (Phase 1B/6 are not yet
  designed, let alone implemented) while the toolchain cost (second interpreter, package manager,
  linter, CI job) is immediate and certain, and because it does not run natively on either realistic
  future hosted target identified in ADR-017.
- **TypeScript local ingestion** (chosen): see above.
- **Browser ingestion**: rejected outright, not merely deprioritized. A browser-based fetch of a
  third-party job board fails on **CORS** (Greenhouse's API sets no permissive
  `Access-Control-Allow-Origin` for an arbitrary SPA origin, and the response is blocked before
  script can read it); requires the **Supabase service-role key** to be reachable from
  browser-executed code to write shared `opportunities`/`opportunity_versions` rows, which is a
  total, irreversible compromise of every user's shared data the moment that code ships
  ([SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md) §4,
  [RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md)); would run ingestion under the requesting user's
  own IP and browser User-Agent, which is indistinguishable from abuse at any volume and violates
  the honest, non-spoofed User-Agent rule in
  [DATA_SOURCES_AND_COMPLIANCE.md](../DATA_SOURCES_AND_COMPLIANCE.md) §4 (**source throttling and
  identity**); and would place the sanitization trust boundary for **untrusted third-party payloads**
  inside the untrusted execution environment itself, contradicting the sanitize-before-storage rule
  in [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md) §6. Rejected unconditionally, not
  reconsidered later.
- **Database-only ingestion** (e.g., `pg_net` or a Postgres extension making the outbound HTTP
  call): moves the untrusted-content fetch into the database process itself, with no sanitization
  library available there, no adapter-level timeout/retry ergonomics, and no unit-test surface
  independent of a live database. Rejected.
- **A hosted API service** (a small always-on FastAPI/Express service performing ingestion on
  request): reintroduces the always-on-host cost and operational burden
  [ADR-002](ADR-002-frontend-and-backend-boundaries.md) and
  [ADR-009](ADR-009-zero-cost-mvp-deployment.md) explicitly avoid, for a workload
  ([ADR-017](ADR-017-local-first-ingestion-execution.md)) that a scheduled batch job — not a
  request/response server — correctly models. Rejected for the MVP; revisit only under the same
  trigger conditions ADR-002 already names for a synchronous layer generally.

## Consequences

- `ingestion/` becomes a second, independently versioned Node/TypeScript project (own
  `package.json`, `package-lock.json`, `tsconfig.json`), pinned to the same Node version as `app/`
  (`.nvmrc`). No npm workspace and no shared package are introduced at this stage — the Postgres
  schema is the contract between `app/` and `ingestion/`, consistent with this repository's existing
  monorepo-without-cross-package-dependency convention.
- CI gains a third job (`ingestion`: install, format check, lint, typecheck, test) alongside the
  existing `frontend` and `database` jobs, with no live third-party network call in CI
  ([TESTING_STRATEGY.md](../TESTING_STRATEGY.md) §4).
- [ADR-003](ADR-003-python-ingestion-pipeline.md)'s status is updated to **Superseded by ADR-016**
  for ingestion/normalization/scoring; its original rationale is left intact as historical context,
  since it correctly anticipated needs (resume parsing, aggregation) this ADR does not touch.
- **Phase 1B resume parsing and Phase 6 aggregation remain open questions**, to be decided on their
  own merits when actually planned — this ADR must not be cited as having already decided them.
- Any future contributor proposing a Python component for a *different* workload does not need to
  argue against this ADR; this ADR's scope is ingestion and deterministic opportunity scoring only.
