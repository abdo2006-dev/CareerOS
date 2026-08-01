# ADR-013: Deterministic Profile Completeness

**Status**: Proposed

## Context

A stored `profiles.profile_complete` flag becomes stale and hides why a profile is not ready. An
opaque percentage has the same explainability problem as an unexplained matching score.

## Decision

Remove the authoritative role of `profiles.profile_complete`. Derive completeness from the
versioned, language-neutral checks in [PROFILE_COMPLETENESS_SPEC.md](../PROFILE_COMPLETENESS_SPEC.md).
The UI shows the named checks and whether each is present, missing, unconfirmed, or optional in
four categories: basic matching readiness, evidence strength, review state, and optional
enrichment. `profile_section_reviews` records deliberate review, including an intentionally empty
section. Its `reviewed_content_revision` is compared with a small per-section revision counter so
create, update, and delete operations make a review stale without relying on a reset flag.

## Alternatives considered

- **Stored boolean**: rejected; it is duplicative state and does not explain remediation.
- **Opaque percentage**: rejected; users cannot tell its components or weights.
- **Deterministic named checks**: chosen; it is testable, portable between clients, and actionable.

## Consequences

Phase 1A records deliberate section review where meaningful, but has no imported suggestions.
Phase 1B adds the unresolved-suggestion check. The initial vertical slice only evaluates checks
whose tables it implements; deferred inputs are product-unimplemented, not user-missing. A future
percentage is allowed only when every component and weight is displayed and documented; it is
never the sole representation.
