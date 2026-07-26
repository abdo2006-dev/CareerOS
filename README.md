# CareerOS

CareerOS is a personal career-intelligence platform for a German-based Electrical and Computer
Engineering (ECE) student. It discovers internships, working-student roles, research positions,
hackathons, scholarships, and other resume-building opportunities; compares them against a
detailed saved profile; explains where the student is competitive and where they are not; and
tracks the full lifecycle from "found it" to "applied" to "interviewed."

This repository currently contains **planning and architecture documentation only**. No
application code, dependencies, or infrastructure has been created yet. See
[Documentation status](#documentation-status) below.

## Why this exists

Job and internship listings disappear, requirements are inconsistently described, and it is hard
for a single student to judge, across dozens of postings, which ones are realistic targets versus
long shots — and which skills are worth building next. CareerOS turns that judgment process into
an explainable, evidence-based pipeline instead of a spreadsheet or a gut feeling.

The first user is a specific person (ECE undergraduate at Constructor University Bremen, starting
year 2 in August 2026), but the system is designed so that supporting additional users later is a
matter of enabling sign-ups, not rearchitecting the schema or the pipeline. See
[ADR-008](docs/adr/ADR-008-private-first-multi-user-later.md).

## Documentation map

| Document | Purpose |
|---|---|
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | What the product must do and for whom |
| [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) | What ships first, what is explicitly deferred |
| [docs/USER_WORKFLOWS.md](docs/USER_WORKFLOWS.md) | Concrete end-to-end usage scenarios |
| [docs/OPPORTUNITY_TAXONOMY.md](docs/OPPORTUNITY_TAXONOMY.md) | Career vs. development opportunities, and how each is classified |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System components, where they run, how they talk |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | How data moves from external source to scored, saved opportunity |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Database schema and entity relationships |
| [docs/SCORING_AND_MATCHING_MODEL.md](docs/SCORING_AND_MATCHING_MODEL.md) | How relevance and competitiveness scores are computed and explained |
| [docs/DATA_SOURCES_AND_COMPLIANCE.md](docs/DATA_SOURCES_AND_COMPLIANCE.md) | Which sources are used, legally and operationally |
| [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) | Auth, data isolation, secrets, resume privacy, threat handling |
| [docs/DEPLOYMENT_STRATEGY.md](docs/DEPLOYMENT_STRATEGY.md) | Where things are hosted and how they ship |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | How correctness is verified, including scoring correctness |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Logging, monitoring, and failure visibility |
| [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Phased implementation sequence |
| [docs/COST_MODEL.md](docs/COST_MODEL.md) | What this costs at each stage, and where the free tiers break down |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Unresolved decisions, honestly tracked |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records |

## Documentation status

This documentation was produced during a **planning-only phase**. Per project instructions:

- No application features have been implemented.
- No dependencies have been installed.
- No placeholder or scaffold production code has been generated.
- Implementation will not begin until this documentation set has been reviewed and explicitly
  approved by the project owner.

## Guidance for coding agents

Before making any change to this codebase, read [AGENTS.md](AGENTS.md).
