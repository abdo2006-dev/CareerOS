# Open Questions

Status: honest tracking of what this planning phase did **not** resolve. Nothing here should be
treated as decided; each should be resolved (by the user, or by a future ADR) before or during the
phase that needs it.

## Product

- ~~**Exact MVP source list — which recruitment system each target employer uses**~~ —
  **resolved by research in Phase 2A.0**: see
  [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md) for the dated, per-employer
  findings (Bosch/Continental on SmartRecruiters; Airbus on an undocumented Workday endpoint;
  Siemens/Infineon/TI/NXP/Deutsche Bahn/Rheinmetall/Hensoldt/Telekom/BMW/Mercedes-Benz/
  Beckhoff/Phoenix Contact/Rohde & Schwarz/OHB/Fraunhofer/DLR/university career pages all on custom
  or SAP SuccessFactors sites with no documented public API). What remains open is narrower and
  listed below: whether the SmartRecruiters access conflict can be resolved, and which specific
  reviewed sources enter the first source configuration.
- **Scoring thresholds**: the boundaries between Strong target / Realistic / Reach / Currently
  unsuitable are described qualitatively in
  [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md) but not numerically — these need
  tuning against real postings, not a guess made in the abstract during planning.
- **How task auto-suggestion should work at MVP**: the brief asks for converting saved
  opportunities into tasks; [MVP_SCOPE.md](MVP_SCOPE.md) treats manual/user-authored task creation
  (from a short suggested list) as sufficient for MVP sign-off, with full auto-generation as a
  fast-follow — confirm this scoping is acceptable.

## Architecture

- ~~**Local/dev Supabase project strategy**~~ — **resolved in Phase 0**: no hosted Supabase
  project exists for development at all; a fully local Supabase CLI stack (Colima + Docker) is
  used instead, with migrations as the sole source of truth. No second hosted "dev" project, no
  Supabase Branching. Exactly one hosted project is reserved for production only, created later.
  See [DEPLOYMENT_STRATEGY.md](DEPLOYMENT_STRATEGY.md).
- **Resume-parsing method (Phase 1B, not Phase 1A)**: the brief doesn't specify whether extraction should use a
  traditional NLP/rules pipeline (spaCy, regex-based section detection) or an LLM call. Given the
  project's deterministic-before-LLM preference, a rules-first approach with LLM assistance only
  where rules clearly fail is the likely direction, but this needs a dedicated design pass before
  Phase 1 of [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), including a cost check (LLM resume
  parsing would be the first real LLM cost, ahead of the Phase 7 explanation feature).
- ~~**Primary-education migration selection**~~ — resolved in the first profile-core slice: no
  legacy row is selected as primary or inferred current. A degree year is copied only to exactly
  one existing row when empty; ambiguous program text remains a deprecated read-only notice for
  manual review.
- ~~**Ingestion runtime language and execution model**~~ — **resolved in Phase 2A.0**: TypeScript
  ([ADR-016](adr/ADR-016-typescript-ingestion-runtime.md)), local CLI execution first
  ([ADR-017](adr/ADR-017-local-first-ingestion-execution.md)). Resume parsing's language/execution
  model is explicitly **not** resolved by either ADR — see the Resume-parsing entry above.
- ~~**Manual vs. shared opportunity ownership**~~ — **resolved in Phase 2A.0**: manually entered
  opportunities are private, user-owned rows in a separate `private_opportunities` table, never
  shared records — see [ADR-018](adr/ADR-018-private-manual-opportunities.md).

## Compliance

- ~~**Per-source terms-of-service review (initial pass)**~~ — **substantially done in Phase 2A.0**
  for the sources actually evaluated: see the dated matrix in
  [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md) for Greenhouse, Lever, Workable,
  SmartRecruiters, Bundesagentur für Arbeit, Make it in Germany, Workday-based sites, EURES,
  EURAXESS, and the researched target-employer career sites. What remains genuinely open:
  - **SmartRecruiters written clarification**: the documented Posting API and its
    `robots.txt` (`Disallow: /` for all agents except one named crawler) conflict; this blocks the
    single highest-coverage source found (Bosch, Continental) until resolved in writing — not by
    interpretation.
  - **Terms re-review cadence**: this pass is a dated snapshot, not a standing guarantee; each
    enabled source needs a periodic re-check against its own `terms_reviewed_at` date (see
    [INGESTION_ARCHITECTURE.md](INGESTION_ARCHITECTURE.md)).
  - **Whether Workable's feed cost is ever justified**: rejected for the MVP on measured bandwidth
    (see [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md)); reconsider only if
    Workable publishes a filtered endpoint or a later hosted worker can affordably stream the full
    feed.
- **Which specific reviewed Greenhouse employer boards enter the first source configuration** —
  a shortlist, not a compliance question; decide at Phase 2A.2 implementation time.
- **Raw-payload retention period and snapshot-retention limits**: this pass reaffirms the existing
  policy (sanitized snapshots only, no indefinite raw retention — see
  [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy)) but does not set a
  specific `opportunity_versions` retention limit; revisit only if storage growth becomes a
  measured problem (see [COST_MODEL.md](COST_MODEL.md)).
- **Hosted execution platform after local validation**: [ADR-017](adr/ADR-017-local-first-ingestion-execution.md)
  names Supabase Edge Functions and Cloudflare Workers as candidates and states the trigger
  conditions for evaluating each, but does not choose between them now — that choice is deferred
  until local execution actually becomes a bottleneck.
- **Whether the GitHub Student Developer Pack (or similar) is already active** for this user —
  affects the realistic fallback options in [COST_MODEL.md](COST_MODEL.md).

## Privacy/security

- **Data export and account-deletion implementation timing**: [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)
  states these must exist and be tested before a second real user is onboarded, but doesn't commit
  to exactly when in the roadmap they get built — flagged in
  [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) Phase 7 as a candidate, not a committed date.

## Not yet decided at all

- Whether/when to pursue the public multi-user launch described loosely in
  [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) Phase 7 — this remains a possibility the
  architecture doesn't foreclose, not a plan with a timeline.
- The specific LLM provider/model for the eventual explanation-prose feature, and its cost — 
  deliberately deferred past this planning phase per [COST_MODEL.md](COST_MODEL.md).
