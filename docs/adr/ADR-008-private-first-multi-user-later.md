# ADR-008: Private-First, Multi-User-Later

**Status**: Proposed

## Context

The MVP has exactly one real user, but the project brief requires that the architecture support
public users later without a full rewrite. Two ways to get there: build single-user shortcuts now
and retrofit multi-tenancy later, or build the multi-tenant mechanism now and simply not expose
sign-up.

## Decision

Build **real authentication and row-level multi-tenant isolation from day one**, even though only
one account exists. Every user-owned table carries a `user_id` and a Postgres RLS policy scoping
access to `auth.uid()` (see [DATA_MODEL.md](../DATA_MODEL.md) and
[SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)). Enabling additional users later is a matter
of allowing sign-up and, eventually, adding account-level features (billing, admin tooling) — not
a schema or authorization redesign.

## Alternatives considered

- **Single hardcoded user, no real auth, add multi-tenancy later**: faster to start, but retrofit-
  ting RLS onto an already-populated schema, with real user data already in irregular shapes built
  around a single-user assumption, is exactly the "rewrite" the brief explicitly rules out.
  Rejected.
- **A shared/global "workspace" concept instead of per-row user ownership** (common in some B2B
  SaaS designs): unnecessary complexity for what is fundamentally personal, not team, data — no
  current or foreseen requirement involves multiple people sharing one profile/application
  history.

## Consequences

- No feature in this system, at any phase, can assume there is exactly one user in the database —
  this must be a standing discipline for every future migration and query, not a one-time setup
  step.
- RLS correctness becomes the top-priority testing concern from the very first schema migration
  (see [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)), before any user-facing feature is built on
  top.
- Public launch (were it to happen) still requires real, separate work — sign-up UX, terms of
  service, abuse controls on user-triggered ingestion (the user-submitted-link adapter),
  billing/quota decisions if ever needed — but none of that work involves touching the
  authorization model itself.
