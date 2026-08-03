# Architecture

Status: the component list and boundaries below are **confirmed direction**; exact library/service
choices within them are cross-referenced to ADRs, each marked with its own status. This document
explains the *why*, not just the *what* — read it alongside [docs/adr/](adr/README.md).

## 1. Guiding constraints

- Single user today, must not require a rewrite to support more (see
  [ADR-008](adr/ADR-008-private-first-multi-user-later.md)).
- $0 recurring cost by default (see [ADR-009](adr/ADR-009-zero-cost-mvp-deployment.md) and
  [COST_MODEL.md](COST_MODEL.md)).
- Deterministic, explainable logic before LLM involvement (see
  [ADR-005](adr/ADR-005-explainable-ranking-before-llm-ranking.md)).
- No always-on backend server unless something genuinely requires synchronous server-side
  execution — every additional always-on process is cost, operational burden, and attack surface
  for a single-maintainer project.
- Portfolio-grade: choices should be explainable and defensible to an engineering employer, since
  this project is itself a resume artifact for the target user.

## 2. Components

**Status note (Phase 2A.0)**: the diagram below reflects the current design after
[ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) (TypeScript ingestion) and
[ADR-017](adr/ADR-017-local-first-ingestion-execution.md) (local-first execution), which supersede
this document's earlier depiction of scheduled GitHub Actions running a Python ingestion job. No
ingestion code exists yet and no hosted Supabase project exists yet — the diagram distinguishes
**implemented**, **approved near-term**, and **possible later** components explicitly, per those
ADRs.

```mermaid
flowchart TB
    subgraph Client["Browser (user device) — implemented"]
        SPA["React + TypeScript SPA\n(Vite build)"]
    end

    subgraph CF["Cloudflare Pages — implemented"]
        Static["Static asset hosting\n(the built SPA)"]
    end

    subgraph Supabase["Supabase — implemented (local dev stack only; no hosted project yet)"]
        Auth["Auth\n(email/password)"]
        PG["Postgres\n(app data + RLS)"]
        Storage["Storage\n(resume files deferred to Phase 1B;\nno raw external content by default)"]
        Edge["Edge Functions (Deno)\n[reserved; candidate future ingestion host,\nsee ADR-017 stage 2 — not built]"]
    end

    subgraph Local["Owner's local machine — approved near-term design (ADR-016/ADR-017)\nno code implemented yet"]
        Ingest["TypeScript ingestion CLI\n(source adapters, run on demand)"]
        Score["TypeScript scoring CLI\n(deterministic ECE relevance, run on demand)"]
    end

    subgraph FutureHosted["Possible later hosted execution — not provisioned\n(ADR-017 migration path, evaluated only when triggered)"]
        FutureEdge["Supabase Edge Function on a schedule"]
        FutureWorker["Cloudflare Worker + Cron Trigger"]
    end

    subgraph Deferred["Deferred — Phase 1B, execution model not yet decided"]
        Parse["Resume-parsing job\n(language/host TBD; ADR-016 does not decide this)"]
    end

    subgraph Ext["External sources — Phase 2A"]
        ATS["Greenhouse Job Board API\n(first adapter, ADR-016/ingestion architecture)"]
        Manual["User-confirmed manual entries\n(no automated fetch, see ADR-018)"]
    end

    SPA <--> Static
    SPA <--> Auth
    SPA <--> PG
    SPA <--> Storage

    Ingest --> ATS
    Ingest -->|service-role key, local .env, never committed| PG
    Score -->|reads opportunities, writes deterministic scores| PG
    Manual -.->|browser-confirmed, private row, see ADR-018| PG

    FutureEdge -.->|later migration stage, not built| PG
    FutureWorker -.->|later migration stage, not built| PG

    Parse -.->|future: reads uploaded resume| Storage
    Parse -.->|future: writes reviewable suggestions| PG
```

### Frontend — React + TypeScript + Vite, hosted on Cloudflare Pages

A single-page app that talks **directly** to Supabase (Postgres via PostgREST/Supabase client,
Auth, Storage) using the user's own session and Postgres Row Level Security for authorization.
There is no application backend server in the MVP request/response path. Runs entirely in the
user's browser; Cloudflare Pages just serves static files (HTML/JS/CSS) over its CDN.

**Trusted/untrusted data**: the SPA renders opportunity descriptions that originated as untrusted
external HTML. All such content is sanitized server-side (during ingestion, before it ever reaches
Postgres) — see [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) — so the frontend can render it
as plain text/limited markup without needing to re-sanitize on every render, though defense in
depth (escaping on render) is still applied.

**Failure cases**: if Supabase is unreachable, the SPA shows cached/last-loaded data where
possible and a clear offline/error state; it never silently shows stale data as current without
indication.

### Phase 1A profile UI and client-state direction

Phase 1A introduces a profile overview plus bookmarkable Education, Experience and Research,
Projects and Links, Skills and Evidence, Languages, Preferences, and Work Eligibility pages.
Each section saves independently; the overview turns deterministic completeness checks into
concrete next actions. A section can be deliberately reviewed when empty; a per-section content
revision makes that review stale after a relevant create, update, or delete. Sections must support
empty, loading, success, validation-error, server-error, and deletion-confirmation states.

**React Router is now justified** because these are real bookmarkable pages with browser-history
behavior, not conditional panels. The first Phase 1A slice installs the current stable
`react-router` package and uses `createBrowserRouter`/`RouterProvider`; tests use
`createMemoryRouter`. **TanStack Query is not added yet**: simple typed repositories and explicit reloads
remain enough until shared cached queries across routes, repetitive mutation invalidation,
background refresh, optimistic updates, or more complex server-state coordination provides a
concrete need.

**Implemented slices**: the profile workspace now includes Basic Profile, Education, and
Experience and Research routes. The experience collection uses the same independent-save,
explicit-reload pattern as education; its dates carry year plus optional month precision rather
than a fabricated day. Projects/links and every remaining Phase 1A section are still deferred.

### Data and auth layer — Supabase (managed Postgres + Auth + Storage)

Supabase is not treated as a black box; it is specifically "managed Postgres with batteries." The
architecture depends on three of its parts:

- **Postgres** for all relational application data (see [DATA_MODEL.md](DATA_MODEL.md)), with
  Row Level Security policies as the authorization boundary for every user-owned table.
- **Auth** for identity (email/password or magic link at MVP). Issues the JWT the frontend uses
  for direct, RLS-scoped Postgres access.
- **Storage** for future Phase 1B resume files, in private buckets with signed URLs. Phase 1A does
  not use Storage for profile data. Raw external content (unsanitized source pages/responses) is
  **not** stored here, or anywhere, by default — see "Raw external-content retention policy" below.

Runs entirely on Supabase's managed infrastructure (their cloud, on top of AWS). The project holds
no server to patch or scale for this layer within the free tier's limits.

### Raw external-content retention policy

The durability promise this product makes is about **normalized, sanitized opportunity content**
— the fields in `opportunity_versions` (see [DATA_MODEL.md](DATA_MODEL.md)) — not about preserving
raw external HTML/JSON as it was originally fetched. Concretely:

- The default, always-on behavior is: fetch → sanitize → normalize → store the sanitized
  snapshot. The unsanitized raw response is discarded after normalization completes.
- An optional, disabled-by-default debug table (`raw_capture_debug`, see
  [DATA_MODEL.md](DATA_MODEL.md#raw-external-content-retention-debug-only-not-a-core-table)) may
  be enabled temporarily while actively developing or debugging a specific adapter, with a short,
  documented retention period (proposal: 14 days), after which rows are deleted by a scheduled
  cleanup step, not left to accumulate.
- Raw content, if ever retained under that debug path, is never rendered to the frontend, never
  sent to an LLM, and is treated as untrusted, disposable, working data — not part of the product's
  core durability guarantee. See [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) for the
  associated data-minimization and test-fixture rules.
- This bounds both storage cost (see [COST_MODEL.md](COST_MODEL.md)) and the amount of
  unsanitized third-party content the system ever holds at rest, which is a meaningful reduction
  in attack surface and legal/data-minimization exposure compared to keeping raw snapshots
  indefinitely "just in case."

**Failure cases**: free-tier Supabase projects pause after a period of inactivity — a scheduled
ingestion run doubles as a keep-alive, but this is documented explicitly as a real operational risk
in [COST_MODEL.md](COST_MODEL.md) and [OBSERVABILITY.md](OBSERVABILITY.md), not hidden.

### Ingestion and scoring — TypeScript, run as a local CLI (Phase 2A; approved near-term design, not yet implemented)

**Status**: this section reflects [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) (runtime
language) and [ADR-017](adr/ADR-017-local-first-ingestion-execution.md) (execution model), which
supersede this document's earlier Python/GitHub-Actions description for ingestion and opportunity
scoring specifically. Resume parsing's language and execution model remain a separate, undecided
Phase 1B question (see below) — neither ADR resolves it.

Two related but distinct TypeScript jobs, run today by the repository owner as an explicit local
CLI, not on any schedule:

1. **Ingestion**: runs each configured source adapter, normalizes results into the common
   opportunity schema, resolves cross-source identity (auto-linking on strong evidence, flagging
   uncertain matches for review, otherwise creating a new canonical opportunity — see
   [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md)), diffs against
   the last known version, and writes new/updated source listings, opportunities, and version
   history to Postgres using a service-role key read from a gitignored local `.env.local` (never
   committed, never held by any hosted compute at this stage).
2. **Scoring**: recomputes deterministic, profile-independent market-relevance scores
   ([SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md) Ranking 1) whenever
   opportunities change meaningfully, writing explainable, versioned score records. Personal
   competitiveness (Ranking 2) is later work, deferred until the profile domains it needs exist.

Chosen as TypeScript specifically because the actual Phase 2A workload (fetch JSON, validate,
normalize, sanitize, hash, upsert) does not need Python's data/ML ecosystem, and because the
realistic future hosted execution targets (Supabase Edge Functions, Cloudflare Workers) both run
TypeScript natively — see [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) for the full
reasoning, including what this does **not** decide about Phase 1B resume parsing.

**Where it runs today**: the repository owner's own machine, invoked on demand
(`node --env-file=.env.local dist/cli.js ingest ...`), against the local (or, once one exists, a
real hosted) Supabase stack — not GitHub Actions, and not any other scheduled or hosted compute.
See [ADR-017](adr/ADR-017-local-first-ingestion-execution.md) for why, and for the explicit,
trigger-gated later migration path (Supabase Edge Function → Cloudflare Worker → last-resort
scheduled container), none of which is provisioned yet.

**Resume parsing** (a future Phase 1B capability, unaffected by ADR-016/ADR-017): it will extract
separately reviewable suggestions, never overwrite confirmed profile records, and must revisit
field/suggestion-level provenance
([ADR-014](adr/ADR-014-confirmed-profile-versus-imported-suggestions.md)). Its language and
execution model are open questions for that phase's own design pass — Python remains a plausible,
but not yet decided, candidate (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)).

**Failure cases**: a failed adapter run must not corrupt existing data — writes are additive
(new versions), and a run that errors partway logs the failure (see
[OBSERVABILITY.md](OBSERVABILITY.md)) and is safely re-run by the owner without duplicating data,
using source-provided stable IDs or URL+content hashing for idempotency. Because runs are manual,
"best-effort cron timing" does not apply here the way it does to the future hosted stages; freshness
is exactly as current as the owner's last run, and the UI must present `stale` accordingly (see
[DATA_FLOW.md](DATA_FLOW.md)).

### Reserved, not built at MVP: a synchronous API/worker layer

Some future features (instant resume processing on upload, synchronous LLM explanations, webhook
receivers for email-based alerts) need a request/response server, not a batch job. The
architecture reserves Supabase Edge Functions (Deno, colocated with the database, generous free
tier) as the first place such logic would go, with a move to a small containerized FastAPI service
(Python) as the fallback if Edge Functions' constraints (execution time, language) don't fit. This
is discussed, not built — see [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md). (Note:
ADR-002's original fallback rationale described this Python service as "consistent with the
ingestion codebase" — since [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) moved ingestion
to TypeScript, that specific justification no longer holds; ADR-002's actual decision, no
synchronous backend at MVP, is otherwise unaffected and remains Accepted.)

## 3. Repository layout (Phase 0: implemented as shown; `ingestion/` updated by Phase 2A)

```
careeros/
  app/            React + TypeScript + Vite frontend (implemented, Phase 0)
  ingestion/      TypeScript: source adapters, normalization, deterministic scoring
                  (placeholder only as of Phase 2A.0 -- no code yet, see ingestion/README.md
                  and ADR-016; implemented starting Phase 2A.1/2A.2. Resume parsing is a
                  separate, undecided Phase 1B question -- not assumed to live here.)
  supabase/       config.toml, migrations/, tests/database/ (pgTAP), scripts/ (local-only
                  dev tooling) -- implemented, Phase 0
  docs/           this documentation set
  .github/workflows/   ci.yml (Phase 0; gains an `ingestion` lint/typecheck/test job in
                       Phase 2A.2). No ingestion/scoring *schedule* is planned in GitHub
                       Actions -- ingestion runs as a local CLI (see ADR-017); scheduled
                       hosted execution, if ever adopted, targets Supabase Edge Functions or
                       Cloudflare Workers, not GitHub Actions cron.
```

A monorepo, not separate repositories, because the frontend, database schema, and ingestion
pipeline change together constantly at this project's size, and a single maintainer gains nothing
from cross-repo versioning overhead.

### Local development environment (Phase 0, implemented)

The local/dev-environment question in the original planning pass is now resolved and exercised,
not just decided on paper:

- **Container runtime**: Colima (Docker CLI + Colima, via Homebrew) — not Docker Desktop. Chosen
  as the lightweight open-source option; see [DEPLOYMENT_STRATEGY.md](DEPLOYMENT_STRATEGY.md) for
  the exact version and a real networking issue this surfaced (Colima's default port forwarder
  exposed the local stack to the LAN, not just localhost — fixed, documented, and worth reading
  before assuming "it just works").
- **Supabase CLI**, pinned to an exact version everywhere (locally and in CI) — never `latest`.
  Local Postgres/Auth/Storage/PostgREST run as Docker containers this CLI orchestrates.
- **Migrations are the sole source of truth** for schema, per [AGENTS.md](../AGENTS.md) — no
  manual edits in Supabase Studio (local) or a hosted dashboard (later), ever.
- **No hosted Supabase project exists yet**, and Phase 0 does not create one. No second hosted
  "dev" project either, and no Supabase Branching (unneeded complexity/cost for a $0, single-
  maintainer workflow). Exactly one hosted project is reserved for later production use only.

## 4. Alternatives considered

Each alternative below is evaluated against this project's actual constraints, not in the
abstract.

### Frontend/full-stack framework

| Option | When it would be the better choice | Why not chosen for the MVP |
|---|---|---|
| **React + Vite (chosen)** | Frontend has no need for server-side rendering; direct-to-Supabase access is sufficient; React's ecosystem/job-market familiarity is itself a portfolio asset in the German market | — |
| **Next.js full-stack** | If the product needs SEO (public opportunity board discoverable by search engines), or needs first-party API routes to avoid a separate Python service for simple endpoints | Adds a Node server/runtime to operate and reason about for no MVP benefit — the MVP is a private, single-user tool with no SEO need. **Revisit at the public-launch phase** (see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)) if a public, crawlable opportunity board becomes a goal |
| **SvelteKit** | Smaller bundles, less boilerplate, if the team already knows Svelte | React has stronger name-recognition on German engineering-adjacent job postings, which matters because this is also a portfolio piece; smaller ecosystem for the specific needs here (resume parsing UI, forms-heavy CRUD) |

### Backend/API layer

| Option | When it would be the better choice | Why not chosen for the MVP |
|---|---|---|
| **No backend; direct Supabase access + batch ingestion/scoring (chosen; TypeScript per [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md), local CLI per [ADR-017](adr/ADR-017-local-first-ingestion-execution.md))** | Fits a single-user tool where almost every operation is CRUD-on-your-own-data (RLS-safe) or an owner-invoked batch job | — |
| **FastAPI (Python) as a real API server** | Once synchronous, user-triggered server-side logic is unavoidable (instant resume parsing, LLM explanation endpoints with rate limiting, webhook receivers) | Needs an always-on host; free tiers for that (Render, Fly.io, Railway) come with sleep/cold-start behavior or limited free hours, adding operational complexity not justified yet. This is the **documented target** for when the batch-only model proves insufficient — see [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md) |
| **Node.js backend** | If the team wanted one language across the whole stack | This synchronous-backend question is independent of the ingestion-language decision below; no synchronous backend is built at MVP either way (this section's own Decision) |

### Ingestion/analysis language

**Status (Phase 2A.0)**: superseded for opportunity ingestion and deterministic scoring by
[ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) — see that ADR for the current decision and
reasoning. The paragraph below is preserved as the original planning-phase rationale, which
correctly anticipated Phase 1B resume parsing and Phase 6 market aggregation; those remain open,
separately-decided questions, not resolved by ADR-016.

Python was specified as a requirement in the brief and is confirmed here: mature HTML
parsing/sanitization libraries, pandas for market-skill aggregation, and the most direct path to
future ML-assisted resume parsing or embeddings work.

### Database

See [ADR-001](adr/ADR-001-database-selection.md) for the full comparison against MongoDB and
Firebase. Summary: Postgres, because the domain is inherently relational (users, opportunities,
versions, scores, applications, tasks all reference each other) and because Postgres Row Level
Security is the specific mechanism the multi-tenant-ready design depends on.

### Search

Postgres full-text search (`tsvector`/`tsquery`) is sufficient at the MVP's realistic data volume
(dozens to low thousands of postings). A dedicated search engine (Elasticsearch, Algolia,
Meilisearch) would be justified by query volume or relevance-tuning needs this project doesn't
have, and would add a service to operate for no proven benefit. Revisit only if full-text search
demonstrably fails to support a needed query pattern.

### Vector search / embeddings

Deferred. If skill/requirement matching later benefits from semantic similarity beyond
keyword/rule matching, `pgvector` (a Postgres extension, available on Supabase) is the first step
— it keeps embeddings in the same database and transaction boundary as everything else. A
standalone vector database (Pinecone, Weaviate, Qdrant) is not justified at this data scale and
would be a second system to keep in sync with Postgres for no clear win.

### Hosting/deployment target

| Option | When it would be the better choice | Why not chosen for the MVP |
|---|---|---|
| **Cloudflare Pages (chosen) for the frontend; Supabase managed for data/auth/storage; local CLI for ingestion/scoring today, with a hosted scheduled stage (Supabase Edge Function, then Cloudflare Worker) evaluated later — see [ADR-017](adr/ADR-017-local-first-ingestion-execution.md)** | Fits a $0, single-user, low-traffic tool with no always-on compute need | — |
| **AWS / Azure / GCP** | Needed once the project needs fine-grained IAM, VPC-level network control, managed queues at scale, or the student specifically wants cloud-provider experience with real infrastructure spend controls | Overkill for current scale; meaningfully higher operational and cost-management burden for a single maintainer. Worth revisiting deliberately at the public-launch phase, and separately, as a *learning* exercise if desired — but not required by the product |
| **Self-hosted** (home server, student cloud credits via GitHub Student Developer Pack) | If Supabase free-tier limits are actually hit | A real $0-adjacent option given the user's student status; documented as a fallback in [COST_MODEL.md](COST_MODEL.md) rather than the default, to avoid taking on server maintenance before it's needed |
| **Long-running background worker** (always-on process, not scheduled batch) | If ingestion needs near-real-time polling (many sources checked every few minutes) | Not needed at MVP ingestion frequency (daily/few-times-daily is enough for job postings and events, and Phase 2A doesn't even run on a schedule yet); a future *scheduled* hosted stage (Supabase Edge Function or Cloudflare Worker, not GitHub Actions — see [ADR-017](adr/ADR-017-local-first-ingestion-execution.md)) is simpler to reason about and free |
| **Dedicated serverless functions (Vercel/Cloudflare Workers) beyond Supabase Edge Functions** | If synchronous compute needs to live outside Supabase's own edge runtime for latency, language, or ecosystem reasons | Supabase Edge Functions are colocated with the database (fewer network hops, one fewer provider to manage) and are the first thing evaluated when synchronous compute becomes necessary |

## 5. Where each component runs (summary)

| Component | Runs on | Trust boundary |
|---|---|---|
| React SPA | User's browser | Untrusted execution environment; never holds secrets beyond the user's own short-lived session token |
| Cloudflare Pages | Cloudflare's CDN | Serves static assets only; no application logic or secrets |
| Supabase Auth/Postgres/Storage | Supabase-managed cloud (AWS-backed) | Authoritative data store; RLS is the authorization boundary |
| TypeScript ingestion/scoring (Phase 2A; [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md)) | The repository owner's own machine, run on demand as a local CLI ([ADR-017](adr/ADR-017-local-first-ingestion-execution.md)) — not GitHub Actions | Holds the Postgres service-role key in a gitignored local `.env.local`; never committed, never exposed to the browser or logs. A later hosted stage (Supabase Edge Function, Cloudflare Worker) would hold it in that platform's own secret storage instead |
| Resume parsing (Phase 1B, deferred) | Not yet decided — language and execution model are open questions ADR-016/ADR-017 do not resolve | Not yet decided |
| External sources | Third-party infrastructure | Fully untrusted; every response is treated as untrusted data, sanitized before storage |

## 6. Scalability limits of this design

This design comfortably handles one user and a realistic ingestion volume (low thousands of
opportunity records). Under Phase 2A's manual local-CLI execution
([ADR-017](adr/ADR-017-local-first-ingestion-execution.md)), cadence is simply "however often the
owner runs it" rather than a target frequency; the daily-to-hourly figures below describe a
possible future scheduled stage, not the current design. Known ceilings, documented honestly rather
than solved preemptively:

- **CI (GitHub Actions) minutes** are free and unlimited on standard runners for this public
  repository; the practical ceiling is runner concurrency and job duration, not a minute quota. This
  applies to CI today; if a future scheduled hosted stage for ingestion is ever adopted, it targets
  Supabase Edge Functions or Cloudflare Workers, not GitHub Actions cron — see
  [ADR-017](adr/ADR-017-local-first-ingestion-execution.md).
- **Supabase free-tier project pausing on inactivity** requires a keep-alive strategy. The original
  plan assumed scheduled ingestion jobs would largely cover this; under Phase 2A's manual execution
  model that mitigation does not apply, so this is currently a **more exposed** fragility than
  originally planned, not a solved one — see [COST_MODEL.md](COST_MODEL.md) §3.
- **No synchronous backend** means any feature requiring instant server-side response (real-time
  chat-style LLM interaction, instant resume feedback) is out of scope until the Edge
  Function/FastAPI layer is added.
- **Single Postgres instance** is fine well past MVP scale; if this ever supports many public
  users with heavy concurrent write load, connection pooling (Supabase provides PgBouncer) and,
  much later, read replicas would be the next steps — not a redesign.

## 7. GitHub Actions reliability characteristics (read before relying on cadence)

**Scope note (Phase 2A.0)**: opportunity ingestion and scoring do **not** currently run on GitHub
Actions at all — see [ADR-017](adr/ADR-017-local-first-ingestion-execution.md); they run as a local
CLI on demand. This section's cautions apply to CI itself (which does run on every push/PR, see
`.github/workflows/ci.yml`) and would apply again to any *future* scheduled workflow this project
adopts — they are not a description of how ingestion currently behaves.

The cadences in [DATA_FLOW.md](DATA_FLOW.md#5-data-freshness-expectations-proposal) are targets,
not guarantees for whichever execution stage is current. This is not a caveat to skim past — it
shapes how every scheduled job and every UI status indicator must be built:

- **Scheduled (`cron`) triggers are best-effort and can start late.** GitHub's own documentation
  states that scheduled workflows may be delayed during periods of high load, most commonly at the
  top of the hour (`:00`) when many repositories' cron jobs fire at once, and can occasionally be
  skipped during platform incidents. A job "running every 15 minutes" should be read as "running
  approximately every 15 minutes, best-effort," not as a real-time guarantee.
- **Cron expressions should avoid `:00`.** Every scheduled workflow in this project should use an
  offset minute (e.g., `7,22,37,52 * * * *` rather than `0,15,30,45 * * * *`) specifically to avoid
  the top-of-hour congestion GitHub documents.
- **Every scheduled job must be idempotent and safely retryable**, because "it didn't run on
  schedule, so I'll just run it again a bit late or trigger it manually" must always be a safe
  action, never a risk of duplicating data — see the idempotency rules in
  [DATA_FLOW.md](DATA_FLOW.md).
- **Resume parsing (and any similar per-item batch processing) is eventually consistent, not
  instant.** The UI must represent this honestly with explicit `pending` / `processing` /
  `completed` / `failed` states (see [DATA_MODEL.md](DATA_MODEL.md#resume-domain)) rather than a
  single "done" flag that implies more immediacy than the system can deliver.
- **Jobs must atomically claim the work they process**, so that two overlapping runs (e.g., a
  scheduled run and a manually-triggered one firing close together) cannot both pick up and
  process the same pending item. The pattern is a conditional `UPDATE ... WHERE status = 'pending'
  RETURNING *` — the database's own atomicity is what prevents the race, not application-level
  locking. This is a Phase 1B requirement; its eventual resume-processing design must document a
  worked sequence before implementation.
- **A job that dies after claiming an item needs a lease/timeout recovery path.** If a runner is
  killed mid-processing, the claimed item must not stay stuck in `processing` forever — a
  subsequent run's claim query must also match items whose `processing` status has an expired
  lease (a `claimed_at` older than a defined timeout) and reclaim them.
- **`workflow_dispatch` is a developer control, not a user-facing button.** GitHub Actions supports
  manually triggering a workflow via `workflow_dispatch`, but this requires repository write
  access and a GitHub-authenticated call — it is not something the frontend can safely expose as a
  "reprocess now" button to the browser, because doing so would require embedding a GitHub token
  with repository/workflow permissions in browser-reachable code, which is a secret-exposure risk
  this project will not accept. If a user-triggered "process this now" action is ever wanted, it
  belongs to the synchronous Edge Function/worker layer (below), not to GitHub Actions.
- **A synchronous layer is the correct fix once waiting is a demonstrated problem, not before.**
  If eventual consistency on this cadence turns out to be a real, observed pain point for the
  user (not a hypothetical one), the next step is the Supabase Edge Function (or containerized
  API/worker) layer already reserved in [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md)
  — this document does not introduce that layer now, and no code should anticipate it before it's
  actually decided.
- **GitHub Actions usage should still be watched, even though it's free here.** This repository is
  public, so standard-runner minutes carry no monthly quota (unlike a private repository on the
  free plan) — but larger/specialized runners and some storage or advanced Actions features can
  still be billable, so a specific cadence choice should be checked against GitHub's own
  billing/usage settings before being relied on, not assumed from a number in this document. See
  [COST_MODEL.md](COST_MODEL.md) and [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
