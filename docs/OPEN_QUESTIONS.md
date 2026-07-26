# Open Questions

Status: honest tracking of what this planning phase did **not** resolve. Nothing here should be
treated as decided; each should be resolved (by the user, or by a future ADR) before or during the
phase that needs it.

## Product

- **Exact MVP source list**: the user has named a target-employer watchlist (Airbus, Siemens,
  NXP, Texas Instruments, OHB, Rohde & Schwarz, Bosch, Infineon, Mercedes-Benz, DLR, Fraunhofer
  institutes, and other Bremen/Hamburg-area employers — see
  [DATA_SOURCES_AND_COMPLIANCE.md §6](DATA_SOURCES_AND_COMPLIANCE.md#6-target-employer-watchlist-proposed-not-approved)),
  which resolves *which employers* to prioritize. What remains open, per employer, is **which
  recruitment system each one actually uses today and whether that system is a compliant source**
  — this has not been verified for any of them and must happen before an adapter is built for any
  specific one.
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
- **Resume-parsing method**: the brief doesn't specify whether extraction should use a
  traditional NLP/rules pipeline (spaCy, regex-based section detection) or an LLM call. Given the
  project's deterministic-before-LLM preference, a rules-first approach with LLM assistance only
  where rules clearly fail is the likely direction, but this needs a dedicated design pass before
  Phase 1 of [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), including a cost check (LLM resume
  parsing would be the first real LLM cost, ahead of the Phase 7 explanation feature).

## Compliance

- **Per-source terms-of-service review**: [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md)
  names source *categories* and plausible examples (Greenhouse/Lever, Bundesagentur für Arbeit,
  EURES) but each specific source's current terms must be actually read before an adapter is
  built — this planning phase did not do that legal review, and it should not be treated as
  already cleared.
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
