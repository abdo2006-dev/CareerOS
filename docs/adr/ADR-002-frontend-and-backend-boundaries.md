# ADR-002: Frontend and Backend Boundaries

**Status**: Accepted — implemented and tested in Phase 0: the frontend talks directly to the local
Supabase stack (Auth + PostgREST) with no backend server in the request path, verified end to end
both by automated tests and manually in a real browser. The reserved Edge Function/FastAPI layer
remains exactly that — reserved, not built.

## Context

Most operations in this product are either (a) a user reading/writing their own data — CRUD on
profile, saved opportunities, applications, tasks — or (b) scheduled batch work — ingestion,
resume parsing, scoring. Very little of the MVP genuinely needs a synchronous, always-on API
server sitting between the frontend and the database. But some future features plausibly do
(instant resume-processing feedback, synchronous LLM explanation calls with rate limiting, webhook
receivers for email-based alerts).

## Decision

For the MVP, **no synchronous backend/API server is built**. The React frontend talks directly to
Supabase (Postgres via PostgREST, Auth, Storage), authorized by Postgres Row Level Security. All
server-side compute that isn't a direct user request/response — ingestion, resume parsing, scoring
— runs as scheduled Python jobs via GitHub Actions (see
[ADR-003](ADR-003-python-ingestion-pipeline.md)). Category (a) operations above need no server;
category (b) operations are handled as short-latency-tolerant batch jobs (e.g., resume parsing
runs every 10-15 minutes rather than instantly).

**Reserved next step, not built now**: when a feature genuinely requires synchronous server-side
execution, the first choice is **Supabase Edge Functions** (Deno), because they're colocated with
the database (no new network hop or provider) and fit small, request-scoped logic well. If a
future need doesn't fit Edge Functions' constraints (execution time limits, needing Python-specific
libraries), the fallback is a small containerized **FastAPI** service, consistent with the Python
choice already made for ingestion.

## Alternatives considered

- **Next.js full-stack (API routes) from the start**: would give a synchronous layer immediately,
  but adds a Node server to operate for a set of features the MVP doesn't need yet, and duplicates
  language/tooling against the already-chosen Python ingestion stack. Revisit specifically if a
  public, SEO-relevant opportunity board becomes a real goal (see
  [ARCHITECTURE.md](../ARCHITECTURE.md)), since SSR is a genuine Next.js advantage this MVP doesn't
  need.
- **FastAPI as the primary backend from day one**: the natural home for synchronous Python logic,
  but requires an always-on host; free tiers for that (Render, Fly.io, Railway) bring sleep/cold-
  start behavior or limited free hours, which is real operational complexity to accept before it's
  proven necessary.
- **Node.js backend**: no reason to introduce a second server-side language when Python already
  covers ingestion/scoring and no Node-specific capability is needed.

  **Note (Phase 2A.0)**: [ADR-016](ADR-016-typescript-ingestion-runtime.md) has since chosen
  TypeScript for opportunity ingestion/scoring specifically, narrowing the premise of this
  alternative (Python no longer "already covers ingestion"). This ADR's own Decision — no
  synchronous backend server at MVP — is unaffected and remains Accepted; only the batch-ingestion
  language has changed, and only for the scope ADR-016 states.

## Consequences

- The frontend's authorization model is entirely dependent on RLS being correct — there is no
  backend layer to catch an authorization mistake. This is accepted because RLS is tested as the
  top priority in [TESTING_STRATEGY.md](../TESTING_STRATEGY.md), not because the risk is ignored.
- Any feature needing instant feedback (e.g., "see your resume parsed immediately after upload")
  is out of scope until the Edge Function layer is added; the UI must communicate "processing,
  check back shortly" honestly rather than faking synchronicity.
- The Supabase anon key is exposed client-side by design (RLS makes this safe); the service-role
  key must never appear in any frontend-reachable code or bundle.
