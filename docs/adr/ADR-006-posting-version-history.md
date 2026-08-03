# ADR-006: Posting Version History

**Status**: Proposed

## Context

Job and event listings change or disappear, and one of the product's explicit goals is to
preserve complete descriptions before that happens, supporting later interview preparation and
market analysis, and letting the user compare versions of the same posting (e.g., a deadline
extension or an added requirement).

An earlier draft of this decision under-specified what a "version" actually contains: it listed
only title/description/responsibilities/qualifications/content hash, leaving location, remote
status, deadline, source URL, category/subtype, and category-specific structured fields on the
stable `opportunities` row instead. That left those fields able to change **silently**, outside
the version history, which directly undermines the goal this ADR exists to satisfy. This revision
corrects that.

## Decision

An opportunity's content is never overwritten in place. `opportunities` holds only stable
identity, lifecycle status, timestamps, and a pointer to the current version (see
[DATA_MODEL.md](../DATA_MODEL.md)) — **no descriptive or historically-meaningful content lives on
that row**. `opportunity_versions` holds a complete, immutable, append-only snapshot per detected
change, containing every mutable fact about the posting:

title, organization, description, responsibilities, required qualifications, preferred
qualifications, location, remote/hybrid status, deadline, application/source URL, category and
subtype (both versioned, since classification can be corrected between captures), career-specific
structured fields, development-specific structured fields, sanitized display content, source
metadata, content hash, captured timestamp, and parser/normalizer version — the full list is
maintained in [DATA_MODEL.md](../DATA_MODEL.md#opportunity_versions--complete-field-list) so this
ADR doesn't drift out of sync with the schema.

A user's saved opportunity pins the specific `opportunity_version_id` they saved, not just the
opportunity's current state (see [DATA_FLOW.md](../DATA_FLOW.md)). **Fit and market scores are
likewise keyed to `opportunity_version_id`, never to `opportunity_id` alone** — see
[SCORING_AND_MATCHING_MODEL.md](../SCORING_AND_MATCHING_MODEL.md#7-scores-are-pinned-to-a-specific-opportunity-version).
A score never silently changes because the underlying posting changed; a changed posting produces
a new version, which — if and when it's rescored — produces a new, separate, timestamped score
row, leaving every previously-shown score exactly as it was.

Each version is additionally tied to the specific `source_listing_id` whose capture produced it
(see [ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md)), so provenance —
which source actually supplied this content — is part of the historical record too.

## Alternatives considered

- **Overwrite-in-place with an `updated_at` timestamp only**: simplest to implement, but destroys
  the ability to diff versions or to know what a saved opportunity looked like when the user
  actually reacted to it — directly contradicts a stated product goal. Rejected.
- **Store only a diff/patch between versions instead of a full snapshot**: saves storage at the
  cost of needing to replay diffs to reconstruct any given historical version, and at this data
  scale (low thousands of small text records) the storage savings don't justify that complexity.
  Full snapshots per version are simpler and cheap enough.
- **Keep "mostly stable" fields (location, deadline) on the `opportunities` row and only version
  the long-text fields**: this was the original design and is exactly what's being corrected here.
  It's tempting because those fields feel less likely to change, but "less likely" is not "never,"
  and a field a user relied on (e.g., a deadline) is precisely the kind of fact this system exists
  to preserve accurately. Rejected — the stable row now carries no content, only identity and
  lifecycle, so there is no field left that could drift out of history by omission.

## Consequences

- Storage grows with every detected content change, not just every new posting — acceptable at
  this project's scale; revisit only if this becomes a measured problem.
- Version-diffing (Ranking/fit-explanation display of "what changed since you saved this") is a
  straightforward comparison between two full-text snapshots, not a diff-replay operation, and now
  correctly captures changes to location/deadline/category/etc., not just description text.
- Scoring correctness now has an explicit, testable guarantee attached to it: a score row's
  `opportunity_version_id` must never be reassigned, and no code path may update a score row's
  numeric fields after creation — a changed score is always a new row. This is tested explicitly
  (see [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)).
- Per [AGENTS.md](../../AGENTS.md), coding agents must never introduce a code path that mutates an
  existing `opportunity_versions` row, mutates an existing score row, or deletes either; corrections
  take the form of a new version and, where scoring is affected, a new score row.

**Note (Phase 2A.0)**: [ADR-018](ADR-018-private-manual-opportunities.md) introduces
`private_opportunities`, a user-owned table for manually entered opportunities, which is
intentionally **outside** this ADR's immutability model — it is ordinary mutable CRUD, like
`work_experience`, because it holds the user's own, continuously-editable content rather than
at-risk third-party content. This ADR's guarantees are unchanged and continue to apply in full to
`opportunities`/`opportunity_versions`.
