# ADR-001: Database Selection

**Status**: Accepted — implemented and tested in Phase 0: Postgres runs locally via the Supabase
CLI with a real migration (`profiles` + `education_entries`), explicit grants, RLS policies, and a
passing pgTAP + API-path integration test suite (see [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)).

## Context

CareerOS needs to store deeply relational data: users, profiles, resumes, opportunities, versioned
snapshots of opportunities, per-user scores against those opportunities, saved opportunities,
applications, tasks, and aggregate market-intelligence data — all cross-referencing each other
(see [DATA_MODEL.md](../DATA_MODEL.md)). It also needs row-level multi-tenant isolation from day
one even though there is currently one user ([ADR-008](ADR-008-private-first-multi-user-later.md)),
and reasonably good text search over opportunity descriptions without adding a separate search
service.

## Decision

Use **PostgreSQL**, provisioned via **Supabase**, as the sole primary data store for the MVP and
foreseeable roadmap.

## Alternatives considered

- **MongoDB**: document model doesn't map naturally onto data that is inherently
  relational-with-joins (an opportunity has many versions, many scores across users, feeds into
  applications and tasks); enforcing referential integrity and row-level per-user isolation is
  more manual and error-prone than in Postgres, where RLS is a first-class, declarative feature.
  MongoDB Atlas has a free tier, so cost is not the deciding factor — data shape and the RLS
  isolation requirement are.
- **Firebase (Firestore)**: bundles auth + database + storage similarly to Supabase, but
  Firestore's security-rules model is harder to express the kind of relational, multi-table
  authorization this schema needs, and its query model doesn't offer full-text search or the
  relational joins market-intelligence aggregation depends on. Firebase Auth alone was considered
  paired with a different database, but that forfeits the benefit of one integrated
  auth-plus-RLS-plus-storage provider.
- **Self-hosted Postgres** (e.g., on a free-tier VM or student cloud credit): viable and
  compatible with everything else in this decision, but adds server maintenance (patching,
  backups, uptime) a single maintainer doesn't need to take on yet when Supabase's managed free
  tier covers the same database at the same near-zero cost. Documented as the fallback if
  Supabase's terms or limits ever become unworkable (see [COST_MODEL.md](../COST_MODEL.md)).

## Consequences

- Postgres full-text search is available immediately for opportunity search, without adding a
  separate search service (see [ARCHITECTURE.md](../ARCHITECTURE.md)).
- `pgvector` is available in-database if/when semantic matching is justified, without introducing
  a second, separately-synced datastore.
- Row Level Security becomes the actual authorization boundary the whole system depends on — this
  raises the importance of RLS testing (see [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)) to the
  top of the testing priority list.
- Coupling to Supabase specifically (versus vanilla Postgres) is an accepted, bounded dependency:
  the underlying data stays in standard Postgres, so migrating off Supabase later, if ever needed,
  is a hosting change, not a data-model rewrite.
