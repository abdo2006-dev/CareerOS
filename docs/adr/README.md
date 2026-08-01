# Architecture Decision Records

ADRs capture a specific decision, the alternatives considered, and the reasoning — so a future
contributor (or future version of the current maintainer) can tell *why* something is the way it
is instead of re-litigating it from scratch, and can deliberately supersede it when circumstances
change.

Per [AGENTS.md](../../AGENTS.md): if you believe a recorded decision is wrong, write a new ADR
that explicitly supersedes it. Do not silently drift away from what's recorded here.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-database-selection.md) | PostgreSQL (via Supabase) as the primary data store | **Accepted** |
| [ADR-002](ADR-002-frontend-and-backend-boundaries.md) | No synchronous backend at MVP; direct frontend-to-Supabase access plus batch Python | **Accepted** |
| [ADR-003](ADR-003-python-ingestion-pipeline.md) | Python for ingestion, parsing, and scoring | Proposed |
| [ADR-004](ADR-004-source-adapter-architecture.md) | Source-adapter architecture with a common opportunity interface | Proposed |
| [ADR-005](ADR-005-explainable-ranking-before-llm-ranking.md) | Deterministic, explainable ranking before any LLM-based ranking | Proposed |
| [ADR-006](ADR-006-posting-version-history.md) | Immutable posting version history, never overwrite in place | Proposed |
| [ADR-007](ADR-007-compliant-data-sources.md) | Only compliant, permitted data sources; no unauthorized scraping | Proposed |
| [ADR-008](ADR-008-private-first-multi-user-later.md) | Private single-user MVP on a multi-tenant-ready schema | **Accepted** |
| [ADR-009](ADR-009-zero-cost-mvp-deployment.md) | Zero-recurring-cost MVP deployment | Proposed (nothing deployed yet) |
| [ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md) | Source-listing/canonical-opportunity split with conservative, review-gated cross-source deduplication | Proposed |
| [ADR-011](ADR-011-manual-profile-before-resume-extraction.md) | Manual structured profile before resume extraction | Proposed |
| [ADR-012](ADR-012-canonical-skills-and-skill-evidence.md) | Canonical skills with flexible, ownership-safe evidence | Proposed |
| [ADR-013](ADR-013-deterministic-profile-completeness.md) | Deterministic, named profile-completeness checks | Proposed |
| [ADR-014](ADR-014-confirmed-profile-versus-imported-suggestions.md) | Confirmed profile records remain authoritative over imported suggestions | Proposed |
| [ADR-015](ADR-015-minimized-work-eligibility-representation.md) | Minimal structured work-eligibility representation | Proposed |

"Proposed" means the decision is this planning phase's recommendation, presented for the project
owner's review — not yet exercised in a real implementation. Once implemented and validated,
update the status to "Accepted"; if later reversed, add a "Superseded by ADR-0XX" note rather than
editing the original decision away.
