# Product Requirements

Status: **confirmed direction**, details subject to refinement during implementation. Anything
marked *(proposal)* is a suggestion made during planning, not a decision.

## 1. Who this is for

Primary and, for the MVP, only user: an Electrical and Computer Engineering (ECE) undergraduate at
Constructor University Bremen, Germany, who completed year 1 and starts year 2 in August 2026.
Relevant engineering areas: embedded systems, electronics, semiconductors, PCB design, signal
integrity, EMC, RF/communications, telecommunications, test and measurement, industrial
automation, control systems, automotive electronics, aerospace electronics, power electronics,
medical electronics, and adjacent software/AI roles.

The schema and access-control model must not assume single-tenancy — see
[ADR-008](adr/ADR-008-private-first-multi-user-later.md) — but no public sign-up, multi-user UI,
or billing exists in the MVP.

## 2. Problem statement

Opportunity discovery for engineering students is fragmented across company career pages,
university newsletters, and platforms that prohibit automated extraction. Listings disappear or
change before a student can act on them. Judging "am I competitive for this" requires manually
cross-referencing a resume against a wall of requirements text, and that judgment is rarely
recorded anywhere reusable. CareerOS addresses discovery, preservation, and explainable
self-assessment as one connected pipeline, prioritizing Germany — especially Bremen and Hamburg —
and international, English-friendly employers.

## 3. Functional requirements

Numbered to match the ten goals in the project brief; each maps to one or more MVP or
post-MVP features (see [MVP_SCOPE.md](MVP_SCOPE.md)).

1. **Discover opportunities** across internships, working-student roles, research roles, student
   jobs, engineering programmes, hackathons, competitions, scholarships, workshops, and career
   events, ingested from a small number of compliant sources (see
   [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md)).
2. **Summarize German engineering market demand** — commonly requested skills, tools, degree-year
   expectations, and language requirements — derived from ingested postings, not asserted from
   general knowledge.
3. **Compare opportunities against a saved profile**: education, skills, projects, languages,
   location preferences, work eligibility, and experience.
4. **Identify currently-competitive positions**, using an explainable recommendation category, not
   a bare percentage.
5. **Identify missing skills or experience** per opportunity and in aggregate across the market.
6. **Preserve complete job descriptions** as structured, versioned snapshots before listings
   change or disappear.
7. **Track applications and interview preparation** through a defined status pipeline.
8. **Convert saved opportunities into concrete tasks** (e.g., "tailor resume," "prepare STAR
   story for X," "submit by <deadline>").
9. **Prioritize Germany, especially Bremen and Hamburg**, in ranking and filtering — this is a
   ranking input, not a hard filter; non-German and remote-friendly international opportunities
   remain visible.
10. **Surface international, English-friendly employers** as a first-class filter/ranking
    dimension distinct from geography.

## 4. Two-category opportunity model

See [OPPORTUNITY_TAXONOMY.md](OPPORTUNITY_TAXONOMY.md) for the full definition. In summary:

- **Career opportunities** (internships, working-student roles, research-assistant roles, student
  jobs, company/university programmes) get **two independent rankings**: market/degree relevance,
  and personal competitiveness.
- **Development opportunities** (hackathons, competitions, research programmes, summer schools,
  scholarships, workshops, career fairs, insight events, open-source programmes, conferences) get
a single ranking built from a different set of dimensions (cost, distance, deadline, resume
value, etc.).

## Phase 1 profile sequencing

**Phase 1A** is a structured, manual, matching-ready career profile. It includes no resume
upload, extraction, background parsing, or imported suggestions. **Phase 1B** follows only after
the manual profile model and workflows are stable; it may create extraction suggestions but never
silently overwrite confirmed data. These are separate planning units, branches, pull requests, and
exit conditions ([ADR-011](adr/ADR-011-manual-profile-before-resume-extraction.md)).

## 5. Explainability requirement (hard constraint)

Every score or recommendation category shown to the user must be traceable to specific evidence:
which resume/profile fact produced which sub-score, and which requirement in the posting it was
compared against. The system must not present a personal-competitiveness score as a statistically
validated acceptance probability unless it later has enough real outcome data (actual application
outcomes) and a documented calibration methodology to justify that framing. Until then, scores are
explicitly framed as *heuristic alignment estimates*. See
[SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md).

## 6. Non-functional requirements

- **Cost**: $0 recurring cost by default for the private MVP; any paid-tier recommendation must be
  documented with its trigger condition in [COST_MODEL.md](COST_MODEL.md).
- **Data durability**: opportunity snapshots and profile/application data must survive source
  listings disappearing; this is a core value proposition, not an incidental feature.
- **Privacy**: resume content, application records, and profile data belong to the user and must
  not be exposed to other (future) users, logged in plaintext, or sent to third parties without a
  clear, documented purpose. See [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md).
- **Legal compliance**: no ingestion from a source whose terms prohibit automated access. See
  [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md).
- **Portfolio value** *(proposal)*: because this project is also intended to demonstrate the
  student's own engineering and software judgment, technology choices should be defensible in an
  interview, not just convenient — this is a soft factor considered in
  [ARCHITECTURE.md](ARCHITECTURE.md)'s alternative comparisons.

## 7. Explicit non-goals for the foreseeable future

Full smart-calendar optimization, voice interfaces, autonomous applications, automatic email
sending, large-scale scraping of platforms like Reddit for resume data, a multi-agent
architecture, Kubernetes, premature microservices, ML-based acceptance prediction without real
outcome data, unauthorized browser automation, and a dedicated vector database before Postgres
full-text search/pgvector prove insufficient. See [MVP_SCOPE.md](MVP_SCOPE.md) for the full deferred
list.
