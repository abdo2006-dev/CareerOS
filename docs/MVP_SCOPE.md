# MVP Scope

Status: **proposal**, built directly from the required MVP list in the project brief, ordered by
implementation dependency rather than importance. See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)
for how this maps to phases.

## Current product mode and engineering priority

**Current product mode**: CareerOS is personal-first, single-owner, and local-first. It is not
offered as a public multi-user service, does not process untrusted public registrations, and does
not operate a public ingestion endpoint. See [ADR-008](adr/ADR-008-private-first-multi-user-later.md)
for the underlying architectural decision this restates as a working-scope reminder, not a new one.

**Engineering priority**: until the owner validates that CareerOS is genuinely useful day to day,
work should prioritize end-to-end working product features over preparation for hypothetical future
users. Concretely, this means:

- Reuse the existing authentication and RLS patterns established in Phase 0/1A rather than
  repeatedly redesigning them for each new table.
- Do not add admin roles, teams, organizations, public registration, abuse prevention, quotas,
  complex authorization layers, or enterprise multitenancy — none of that is needed by a
  single-owner system, and [ADR-008](adr/ADR-008-private-first-multi-user-later.md) already covers
  when it becomes relevant.
- Do not create exhaustive multi-user test matrices for every simple table (see
  [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for the resulting essential-vs-deferred test scope).
- Do not conduct broad security-architecture passes unless a feature introduces a concrete new
  risk (e.g., a new external-content trust boundary, a new privileged function).
- Do not optimize for large-scale deployment.

A practical implementation-effort guideline for Phase 2A.1 and similar feature work: roughly 70%
product functionality, 20% correctness and tests that matter, no more than roughly 10% essential
security/auth work unless a concrete blocker requires more.

**This is a planning-effort discipline, not a relaxation of secret handling or personal-data
privacy.** The safeguards below remain required regardless of product stage:

- Secrets and service-role credentials must not reach the browser or the repository.
- Personal profile and application data must remain private ([SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)).
- Shared ingestion records must not be writable by the browser ([RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md)).
- External description content must be rendered safely ([SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md#6-untrusted-external-content)).
- Ingestion must be deterministic and must not silently overwrite saved listing history
  ([ADR-006](adr/ADR-006-posting-version-history.md)).
- Destructive operations require basic confirmation.
- Existing authentication and RLS must not regress.

## In scope for MVP

1. **Authentication** — Supabase Auth, single account, schema designed for many. No public
   sign-up flow yet.
2. **Phase 1A user career profile** — manually maintained structured education, target roles,
   locations, minimized work eligibility, languages, skills, projects, and evidence.
3. **Phase 1B resume upload and structured extraction** — only after the manual model and editing
   workflows are stable. Parsing creates reviewable suggestions; it never overwrites confirmed
   data ([ADR-014](adr/ADR-014-confirmed-profile-versus-imported-suggestions.md)).
4. **Skills, education, projects, languages, preferences, and target roles** as first-class,
   individually editable profile sections.
6. **Opportunity ingestion from a small number of compliant sources** — enough to validate the
   pipeline end to end, not broad coverage. See [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md).
7. **Common normalized opportunity schema** shared by every source adapter.
8. **Germany-wide ECE market-relevance ranking** (Ranking 1).
9. **Personal competitiveness ranking** (Ranking 2), with explainable sub-scores.
10. **Explainable strengths and gaps** per opportunity.
11. **Saved opportunities** with user notes.
12. **Posting snapshots and version history**.
13. **Application tracking** through a defined status pipeline, with interview-prep notes and a
    pinned listing snapshot for both shared and private opportunities — part of the Phase 2A.1 exit
    condition directly (see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)), not a later phase.
14. **Basic market-skill analysis** — most-requested skills/tools across ingested postings.
15. **Hackathon and programme discovery** (development opportunities, at least one source).
16. **Development-opportunity ranking** using the dimensions in
    [OPPORTUNITY_TAXONOMY.md](OPPORTUNITY_TAXONOMY.md).
17. **Simple tasks associated with opportunities** — manually created at MVP; auto-generation from
    templates is a fast-follow, not required for MVP sign-off.

## Explicitly deferred

- Resume storage, upload, parsing, extraction drafts, and imported suggestions until Phase 1B.

- Full smart-calendar optimization (calendar sync, scheduling assistant).
- Voice recognition / voice interfaces.
- Autonomous applications (the system never submits an application on the user's behalf).
- Automatic email sending (draft generation is plausible later; sending requires explicit user
  action every time).
- Large-scale Reddit or social-media resume/outcome data collection.
- Multi-agent AI architecture.
- Kubernetes.
- Premature microservices — everything starts as one deployable frontend, one Postgres instance,
  and one TypeScript job runner for ingestion/scoring (see
  [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md); this note previously said "Python job
  runner" before that ADR).
- Machine-learning acceptance predictions without real, sufficient outcome data.
- Unauthorized browser automation (headless browsing of sites that forbid it).
- A dedicated vector database — pgvector inside the existing Postgres instance is the ceiling for
  the MVP and near-term roadmap; a standalone vector DB is only reconsidered if pgvector
  demonstrably cannot keep up, which is unlikely at this data scale (low thousands of postings).

## Definition of done for the MVP

The MVP is complete when the user can, without developer intervention: sign in, maintain a
profile, see a ranked list of real German ECE-relevant opportunities pulled from at least one live
compliant source, see why a specific opportunity is or is not a good personal fit, save it with a
preserved snapshot, track it through to an application status, and see at least one basic
market-skill summary. Anything beyond that is post-MVP.
