# ADR-018: Manually Entered Opportunities Are Private, Owned Rows — Not Shared Records

**Status**: Proposed. Resolves an open question the Phase 2A planning pass explicitly left
unsettled: whether a manually entered opportunity becomes a globally shared record (like an
adapter-ingested one) or a private, user-owned one. No table from this ADR exists yet.

## Context

Phase 2A must support the user pasting a URL and confirming normalized fields for a posting no
configured adapter reaches (a Fraunhofer institute role, a Bremen/Hamburg university position, a
scholarship). The shared opportunity-identity model
([DATA_MODEL.md](../DATA_MODEL.md), [ADR-006](ADR-006-posting-version-history.md),
[ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md)) was designed for
**trusted, service-role-written, third-party-sourced** content: immutable versions, conservative
cross-source deduplication, and a strict "browser never writes a shared row" grant model
([RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md)). A manual entry is different on every one of those
axes: it is user-authored, mutable by its owner, never deduplicated across users, and — unless a
decision says otherwise — should default to **private**, the same way every other profile-domain
table in this project defaults to owner-only visibility
([AGENTS.md](../../AGENTS.md), [ADR-008](ADR-008-private-first-multi-user-later.md)).

Two designs were compared.

### Option A — Scoped opportunity records (one table, nullable owner)

Add a nullable `owner_user_id` to `opportunities` itself. A row is either a trusted shared record
(`owner_user_id is null`, service-role-written) or a private manual record
(`owner_user_id = auth.uid()`, browser-written). RLS would read: authenticated users may `SELECT`
where `owner_user_id is null OR owner_user_id = (select auth.uid())`.

### Option B — Separate private table, promotable later (chosen)

Manual entries live in a new, ordinary user-owned table, structurally unrelated to
`opportunities`/`opportunity_versions`/`source_listings`. A nullable pointer column allows a later,
explicit, trusted-only linking action to associate a private entry with a canonical shared
opportunity if an adapter subsequently discovers the same posting — but no such linking logic is
built in Phase 2A.

## Decision

**Option B.** A new user-owned table, `private_opportunities`, holds every manually entered
opportunity. It is structurally and permission-wise unrelated to the shared
`opportunities`/`opportunity_versions`/`source_listings` tables.

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `user_id` | not null, references `profiles(user_id)` on delete cascade — **literally `user_id`**, per [AGENTS.md](../../AGENTS.md); `unique (user_id, id)` reserved for future ownership-safe children |
| `source_url` | not null, `https` only, ≤ 2048 chars — the pasted URL, preserved verbatim as provenance regardless of whether structured import ever succeeds |
| `title` | not null, ≤ 400 |
| `organization_name` | not null, ≤ 200 |
| `location_text` | not null, ≤ 200 |
| `opportunity_kind`, `employment_type`, `remote_mode` | same enums as the shared schema ([DATA_MODEL.md](../DATA_MODEL.md)); user-selected, not adapter-classified |
| `description_text` | sanitized plain text, ≤ 20 000 — a user-pasted excerpt, not a full immutable third-party snapshot |
| `posted_at`, `application_deadline`, `application_url` | nullable, user-supplied |
| `dismissed_at` | nullable timestamptz — the private-entry equivalent of "hide"; there is no private "save" state, because a private row is implicitly the user's own saved record from the moment it exists |
| `promoted_to_opportunity_id` | nullable, references `opportunities(id)` — **not writable by the browser**; see "Promotion" below |
| `created_at`, `updated_at`, `last_confirmed_at` | standard, following the `work_experience` convention exactly |

RLS and grants follow the proven `work_experience` pattern exactly
([RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md)): `revoke all` then `grant select` to
`authenticated`; column-scoped `insert`/`update` grants excluding `user_id`, timestamps, and
`promoted_to_opportunity_id`; four named owner-only policies
(`private_opportunities_select_own` etc.), predicate `(select auth.uid()) = user_id` in both
`using` and `with check`. **No shared-table grant of any kind is touched** — the browser's
permission surface on `opportunities`/`opportunity_versions`/`source_listings` is completely
unchanged by this ADR.

Content is ordinary mutable CRUD (edit-in-place with `updated_at`/`last_confirmed_at`), **not** an
immutable version chain. This is a deliberate, narrow departure from
[ADR-006](ADR-006-posting-version-history.md): that ADR's immutability guarantee exists because
third-party content can disappear and a user's *reaction to a specific past snapshot* must remain
reconstructable. A manual entry is the user's own words, under their own continuous control — the
same reasoning that makes `work_experience` ordinary mutable CRUD rather than versioned applies
identically here. See the cross-reference note added to ADR-006 in this same change.

### Promotion (design only — not implemented in Phase 2A)

If a later adapter discovers the same real-world posting the user already entered manually, a
**trusted-only** action (never a browser grant) may set `promoted_to_opportunity_id` on the private
row to point at the canonical shared `opportunities` row. This is strictly additive: it never
deletes, truncates, or overwrites the private row's own content, and it never merges the private
row into the shared identity/deduplication model in
[ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md) — that model governs
shared, service-role-written rows only, and a private entry is out of its scope entirely unless and
until this explicit promotion happens. No promotion logic, matching heuristic, or UI is built in
Phase 2A; the column exists so that adding it later is an ordinary feature, not a breaking schema
change.

### Reading the two lists together

The opportunity list view merges two independent, RLS-scoped queries — the shared
`opportunity_search` view (all authenticated users, per
[DATA_MODEL.md](../DATA_MODEL.md)/[RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md)) and the user's
own `private_opportunities` rows — client-side, at MVP data volumes. No SQL-level `UNION` view is
introduced in Phase 2A; if result volume ever makes client-side merging impractical, a `UNION ALL`
read-side view is a query-layer change, not a schema change.

## Evaluation against the comparison criteria

| Criterion | Option A | Option B (chosen) |
|---|---|---|
| **RLS simplicity** | Every policy on `opportunities` becomes a two-branch `OR`, and every *other* table that joins to `opportunities` (`opportunity_versions`, `user_opportunity_state`, future scoring tables) inherits that same ambiguity or must special-case it | Two tables, two simple, independent, single-branch RLS models — exactly the pattern already proven for every other table in this schema |
| **Query/list complexity** | One query, but every consumer must remember the ownership branch exists | Two queries merged at the read layer; more explicit, not more complex — and it makes "is this shared or private" a structural fact instead of a runtime check |
| **Snapshot/version reuse** | Tempting to reuse `opportunity_versions` for private content, but that reuses an *immutable* mechanism built to solve a problem (preserving disappearing third-party content) private entries don't have | Ordinary mutable row, matching `work_experience`'s already-proven, simpler shape |
| **Future multi-user privacy** | A single shared table for both kinds of data is a larger, higher-consequence surface for a future RLS mistake to leak a private row as if it were shared | Private data lives in the same structurally-owner-scoped shape as every other private table in this project — the smallest possible blast radius for a policy bug |
| **Deduplication** | A private row participating in the same table as shared rows raises an immediate question — does it enter `ADR-010`'s dedup pipeline? — that Option A cannot avoid answering | Out of scope by construction; `ADR-010` governs shared rows only, cleanly |
| **Manual-to-ingested promotion** | "Promoting" a private row would mean *changing its `owner_user_id` to null*, i.e. mutating a row from private to shared in place — a much larger, harder-to-audit operation than setting a pointer | An explicit, additive, trusted-only pointer; the private row is never mutated into a different trust class |
| **PostgREST access patterns** | One endpoint, but every read must filter correctly by the ownership branch or leak data | Two ordinary endpoints, each with the single, already-proven ownership predicate |

## Guarantees this decision satisfies

- **A manually entered record is private by default.** It is created in a table with zero shared
  read grant.
- **One user's manual entry is never exposed to another.** Same owner-only RLS predicate proven
  across every existing user-owned table.
- **The browser cannot forge an adapter-ingested shared record.** The browser's grants on
  `opportunities`/`opportunity_versions`/`source_listings` are untouched by this ADR — it adds no
  new browser write path to any shared table. (This also **retires** the `import_manual_opportunity`
  `SECURITY DEFINER` RPC sketched in the earlier, non-binding Phase 2A planning pass — it is no
  longer needed, because manual entries never touch a shared table at all.)
- **Trusted workers can create shared records.** Unchanged — service-role only, as already
  specified.
- **Manual records retain clear provenance.** `source_url` is always preserved verbatim, independent
  of whether structured fields were confirmed correctly.
- **A later adapter match does not silently overwrite private content.** Promotion, if built later,
  only ever sets a pointer; it is additive and reversible-by-inspection, never a mutation of the
  private row's own fields.

## Relationship to existing ADRs

- [ADR-006](ADR-006-posting-version-history.md) (immutable versioning) is **not changed**; a short
  cross-reference note is added there stating that `private_opportunities` is intentionally outside
  its immutability model, for the reason given above.
- [ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md) (identity/dedup) is
  **not changed**; a short cross-reference note is added there stating it governs shared,
  service-role-written rows only, and that promotion (this ADR) is the sole, explicit, non-automatic
  bridge between a private entry and a canonical shared opportunity.
- [DATA_MODEL.md](../DATA_MODEL.md) is updated to add `private_opportunities` under the user-owned
  domain (alongside `user_opportunity_state`), replacing the informal "manual source" sketch from
  the earlier planning pass.
- [RLS_POLICY_MATRIX.md](../RLS_POLICY_MATRIX.md) gains a row for `private_opportunities` under the
  user-owned domain, following the exact `work_experience` template.

## Alternatives considered

- **Option A** (above): rejected per the evaluation table — it makes the single highest-severity
  risk category in this project ([TESTING_STRATEGY.md](../TESTING_STRATEGY.md) §1, RLS correctness)
  harder to reason about for a benefit (fewer tables) that does not outweigh the cost.
- **No private manual entry at all; force every manual import through the shared, service-role
  path** (the informal sketch in the earlier planning pass, via an `import_manual_opportunity`
  `SECURITY DEFINER` RPC): rejected because it makes every user's manual notes about their own job
  search globally readable by every other authenticated user by default, which is a worse privacy
  default than every other personal-data table in this project and is not required by any stated
  product goal.

## Consequences

- Phase 2A.1 implements `private_opportunities` with the schema and RLS above, plus the pgTAP and
  API-integration tests matching the existing `work_experience` test pattern.
- The opportunity list and detail UI must clearly distinguish a private manual entry ("Added by
  you") from a shared, source-derived one ("Discovered via Greenhouse"), consistent with the
  provenance requirement in [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md).
- `user_opportunity_state` (save/hide) applies only to shared `opportunities` rows;
  `private_opportunities.dismissed_at` is the equivalent private-row mechanism, avoiding a
  foreign-key union across two different target tables in one state table.
- No promotion/linking feature, matching logic, or UI is authorized by this ADR; building it later
  requires its own design pass, not an extension read into this one.
