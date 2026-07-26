# MVP Scope

Status: **proposal**, built directly from the required MVP list in the project brief, ordered by
implementation dependency rather than importance. See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)
for how this maps to phases.

## In scope for MVP

1. **Authentication** — Supabase Auth, single account, schema designed for many. No public
   sign-up flow yet.
2. **User career profile** — structured record of education, target roles, location preferences,
   work eligibility, languages.
3. **Resume upload and structured extraction** — PDF/DOCX upload, parsed into structured skills /
   experience / education entries. Parsing is assisted, not blindly trusted (see requirement 4).
4. **Manual profile correction** — every extracted field is user-editable; extraction is a
   starting point, not an authority.
5. **Skills, education, projects, languages, preferences, and target roles** as first-class,
   individually editable profile sections.
6. **Opportunity ingestion from a small number of compliant sources** — enough to validate the
   pipeline end to end, not broad coverage. See [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md).
7. **Common normalized opportunity schema** shared by every source adapter.
8. **Germany-wide ECE market-relevance ranking** (Ranking 1).
9. **Personal competitiveness ranking** (Ranking 2), with explainable sub-scores.
10. **Explainable strengths and gaps** per opportunity.
11. **Saved opportunities** with user notes.
12. **Posting snapshots and version history**.
13. **Application tracking** through a defined status pipeline.
14. **Basic market-skill analysis** — most-requested skills/tools across ingested postings.
15. **Hackathon and programme discovery** (development opportunities, at least one source).
16. **Development-opportunity ranking** using the dimensions in
    [OPPORTUNITY_TAXONOMY.md](OPPORTUNITY_TAXONOMY.md).
17. **Simple tasks associated with opportunities** — manually created at MVP; auto-generation from
    templates is a fast-follow, not required for MVP sign-off.

## Explicitly deferred

- Full smart-calendar optimization (calendar sync, scheduling assistant).
- Voice recognition / voice interfaces.
- Autonomous applications (the system never submits an application on the user's behalf).
- Automatic email sending (draft generation is plausible later; sending requires explicit user
  action every time).
- Large-scale Reddit or social-media resume/outcome data collection.
- Multi-agent AI architecture.
- Kubernetes.
- Premature microservices — everything starts as one deployable frontend, one Postgres instance,
  and one Python job runner.
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
