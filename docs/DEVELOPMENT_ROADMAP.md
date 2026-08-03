# Development Roadmap

Status: **proposal** for Phases 1 onward; Phase 0 is implemented (see below). Phases are
sequenced by dependency (what must exist before the next phase is useful), not by calendar date —
no phase begins until it has been explicitly reviewed and approved, per the project's stated
process.

## Phase 0 — Foundations (no user-facing features yet) — **done**

- Repository scaffolding matching [ARCHITECTURE.md](ARCHITECTURE.md)'s layout: `app/` (React +
  TypeScript + Vite), `supabase/` (config, migrations, pgTAP tests, local-only scripts),
  `ingestion/` left as a placeholder, `.github/workflows/ci.yml`.
- Local Supabase CLI stack (Colima + Docker); initial migration for the profile domain
  (`profiles` + `education_entries` only — a deliberate two-table vertical slice, not the full
  eight-table profile domain originally listed for evaluation; see
  [DATA_MODEL.md](DATA_MODEL.md) for why the remaining six tables are deferred to Phase 1) and
  password-based auth wired up.
- Explicit grants (revoke-then-grant, not relying on Supabase's defaults) and RLS policies for
  both tables, with the pgTAP + real API-path integration tests from
  [TESTING_STRATEGY.md](TESTING_STRATEGY.md) passing before anything else is built on top.
- CI running lint/types/tests/build (frontend) and migrations/RLS/API-integration (database) on
  every push/PR.

**Exit condition, met**: a user can sign in with email/password, load their own profile, edit and
save it (RLS-permitted), sign out — verified both by automated tests and by hand in a real
browser against the real local stack. No opportunity data yet.

## First Phase 1A PR — Profile core and primary education vertical slice — **implemented**

This deliberately small slice implements only the forward migration of existing Phase 0
education values, refined `profiles` and `education_entries`, `profile_section_reviews` for
`basic_profile` and `education`, exact grants/RLS/pgTAP/API tests, React Router foundation, profile
overview, education CRUD, and completeness checks limited to those implemented inputs. It must not
claim full completeness while other Phase 1A domains do not exist.

The migration retains the legacy fields as deprecated compatibility data. It safely copies a legacy
degree year only to one existing education row when unambiguous; it does not select a primary,
infer a status, or map the ambiguous degree-program text.

## Phase 1A — Structured manual career profile

- Full section-based CRUD for the logical profile domain in [DATA_MODEL.md](DATA_MODEL.md):
  education, experience/research, projects/links, skills/evidence, languages, preferences,
  targets, and minimized work eligibility.
- Deterministic completeness using [PROFILE_COMPLETENESS_SPEC.md](PROFILE_COMPLETENESS_SPEC.md),
  exact grants/RLS, and the Phase 1A tests in [TESTING_STRATEGY.md](TESTING_STRATEGY.md).
- Multiple bookmarkable profile pages justify React Router; no dependency is installed in this
  planning PR. TanStack Query remains deferred until its documented trigger occurs.

**Exit condition**: Workflow 1 works through manual entry only, with independent section saves,
actionable completeness, and verified cross-user isolation.

The experience/research PR adds the `work_experience` vertical slice, including its review and
partial-completeness state. Later Phase 1A PRs add projects/links; then skills/evidence/languages;
then preferences/targets/work eligibility; and finally the complete v2 evaluator. At every stage,
unimplemented checks are shown as product-unavailable rather than user omissions.

## Phase 1B — Resume intake and extraction drafts

- Private resume storage, upload, scheduled parsing, and separately reviewable extraction
  suggestions only after Phase 1A is confirmed stable.
- Explicit acceptance, correction, and rejection; no extraction silently overwrites confirmed
  profile data. Revisit field/suggestion-level provenance at implementation time.

**Exit condition**: a resume produces a truthful, reviewable draft without altering confirmed
records unless the user explicitly accepts a change.

## Phase 2A — Opportunity discovery MVP

**Status**: architecture and source research complete (Phase 2A.0); no schema, adapter, or UI code
implemented yet. Runtime and execution-model decisions are recorded in
[ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) (TypeScript, superseding
[ADR-003](adr/ADR-003-python-ingestion-pipeline.md) for this scope),
[ADR-017](adr/ADR-017-local-first-ingestion-execution.md) (local-CLI execution first), and
[ADR-018](adr/ADR-018-private-manual-opportunities.md) (manual entries are private, owned rows).
Source compliance findings are recorded in
[DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md); the adapter/orchestrator design is
in [INGESTION_ARCHITECTURE.md](INGESTION_ARCHITECTURE.md).

**Sequencing note**: the original Phase 2A.0 plan split "opportunity foundation" (schema, RLS,
empty UI) and "Greenhouse adapter" into two separate PRs. Per the personal-first priority in
[MVP_SCOPE.md](MVP_SCOPE.md#current-product-mode-and-engineering-priority), those are combined
below into one vertical milestone — a feature is not useful merely because tables and empty screens
exist; the owner needs to actually browse and act on real postings before the next slice starts.

- **Phase 2A.0 — Architecture and compliance** (this PR): ADRs, source-compliance registry,
  ingestion architecture, shared-vs-private opportunity data decision, implementation boundaries.
  No runtime implementation.
- **Phase 2A.1 — Personal Opportunity MVP** (the first minimum-useful milestone; one vertical PR or
  tightly coordinated implementation branch): shared opportunity identity/version schema
  ([DATA_MODEL.md](DATA_MODEL.md)), the `private_opportunities` table
  ([ADR-018](adr/ADR-018-private-manual-opportunities.md)), the ingestion-source registry, exact
  RLS/grants ([RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md)); the TypeScript local ingestion CLI
  ([ADR-016](adr/ADR-016-typescript-ingestion-runtime.md),
  [ADR-017](adr/ADR-017-local-first-ingestion-execution.md)) implementing the source-adapter
  interface ([ADR-004](adr/ADR-004-source-adapter-architecture.md)) for Greenhouse first, since it
  offers unauthenticated, robots-permitted, complete-response public access with the strongest
  observed timestamp coverage (see [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md))
  against a small, reviewed set of configured boards; the identity/deduplication step
  ([ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md)) built alongside
  this first adapter, even though one adapter alone can't yet produce a cross-source duplicate —
  it's the shared pipeline every subsequent adapter plugs into; normalization into the complete
  common schema (see [DATA_MODEL.md](DATA_MODEL.md#opportunity_versions--complete-field-list)), full
  version history, conservative closure detection; manual metadata entry for unsupported sources;
  opportunity list/detail UI, search and essential filters (Postgres full-text search), save/hide;
  and application tracking end to end — status pipeline, pinned listing snapshots (shared and
  private, see [DATA_MODEL.md](DATA_MODEL.md#user-activity-domain-user-owned-rls-protected)), and
  interview-preparation notes. No live third-party call in CI.
- **Phase 2A.2 — Explainable ECE market relevance**: deterministic taxonomy and rule-based scoring
  (Ranking 1 only — profile-independent; personal competitiveness/Ranking 2 remains Phase 3), a
  ranking UI, synthetic evaluation vectors. No acceptance probability, per
  [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md).

**Exit condition (met at Phase 2A.1)**: the owner can run one local command, import real Greenhouse
opportunities, browse and search them in CareerOS alongside any manually entered private
opportunities, save a listing, mark it applied, update its status, and later inspect the exact
pinned listing content used for interview preparation — before any relevance ranking exists.
Phase 2A.2 makes the list explainably ranked rather than merely searchable.

## Phase 3 — Personal-competitiveness scoring

**Note**: Ranking 1 (profile-independent market/degree relevance) moved earlier, into
**Phase 2A.2**, since it needs no profile data and makes Phase 2A's opportunity list explainably
ranked rather than merely searchable. Phase 3 covers what still requires profile domains that don't
exist until Phase 1A is fully built out.

- Hard eligibility rules.
- Ranking 2 (personal competitiveness), with the `evidence_jsonb` explainability payload and the
  "My Fit" view from [USER_WORKFLOWS.md](USER_WORKFLOWS.md).
- Golden-fixture regression tests for scoring (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

**Exit condition**: the user can look at a real posting and get a trustworthy, evidence-linked
explanation of their fit.

## Phase 4 — Save, track, act — **absorbed into Phase 2A.1**

Saved opportunities with pinned snapshots, the application pipeline, and interview-prep notes are
no longer a separate later phase — per the personal-first priority in
[MVP_SCOPE.md](MVP_SCOPE.md#current-product-mode-and-engineering-priority), they are part of Phase
2A.1's exit condition directly, since a searchable-but-untrackable opportunity list is not yet a
genuinely useful product. This phase number is kept (not renumbered away) so existing references
and history stay traceable; there is no separate Phase 4 scope remaining. Workflows 4 and 6 in
[USER_WORKFLOWS.md](USER_WORKFLOWS.md) now work end to end at Phase 2A.1.

## Phase 5 — Development opportunities

- Event/hackathon/scholarship source adapter(s).
- Development-opportunity ranking dimensions and view.

**Exit condition**: Workflow 5 works end to end; MVP definition of done is fully satisfied.

## Phase 6 — Market intelligence

- Weekly aggregation job (`market_skill_mentions`).
- Market-intelligence view: most-requested skills/tools, and the gap against the user's own
  profile.

**Exit condition**: goal 2 and 5 from [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) are met
with real, ingested data rather than assumption.

## Phase 7 — Hardening and expansion (post-MVP)

Candidates, not commitments, roughly in likely priority order:

- Additional source adapters (government/EU job sources, more ATS coverage, user-submitted links).
- LLM-assisted explanation prose layered on top of already-computed scores (§5 of
  [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md)).
- Synchronous API/worker layer (Supabase Edge Functions first) if instant resume processing or
  similar becomes a real pain point (see [ADR-002](adr/ADR-002-frontend-and-backend-boundaries.md)).
- pgvector-based semantic matching if keyword/rule matching proves insufficient.
- Data export and account-deletion tooling, formalized and tested ahead of onboarding any second
  user.
- Public multi-user launch groundwork: sign-up flow, terms of service/privacy policy, abuse
  controls on ingestion triggered by user-submitted links, and a real look at Next.js/SSR for a
  public, crawlable opportunity board (see [ARCHITECTURE.md](ARCHITECTURE.md)'s alternatives
  section) — this phase deliberately gets its own future planning pass rather than being designed
  in detail now.

## Explicit sequencing rules

- Ranking 1 (Phase 2A.2) never starts before ingestion (Phase 2A.1) produces real data, and
  personal-competitiveness scoring (Phase 3) never starts before Ranking 1 exists — scoring logic
  built against imagined data tends to fit reality poorly.
- No LLM-based feature is built before the deterministic scoring pipeline exists and passes its
  regression tests, per [ADR-005](adr/ADR-005-explainable-ranking-before-llm-ranking.md).
- Public multi-user work does not begin until the private MVP (Phases 0-6) is stable and the RLS
  isolation model has been exercised by real usage.
- A second adapter that could plausibly cover an employer already covered by an existing adapter
  is not enabled until the potential-duplicate review queue (Workflow 8) is real and working —
  otherwise cross-source duplicates would silently accumulate with no way for the user to resolve
  them.
