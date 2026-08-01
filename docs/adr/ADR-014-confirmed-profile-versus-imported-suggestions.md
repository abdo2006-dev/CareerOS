# ADR-014: Confirmed Profile Versus Imported Suggestions

**Status**: Proposed (preparation for Phase 1B)

## Context

Resume parsing is probabilistic. Treating extraction as an update to a confirmed profile could
silently discard user corrections and make it impossible to distinguish a claim from a draft.

## Decision

Confirmed profile records are authoritative. Phase 1B extraction creates separately reviewable
suggestions; it never silently overwrites confirmed records. Acceptance, correction, and rejection
are explicit user actions. Phase 1A creates neither resume nor suggestion tables.

## Consequences

Phase 1B must design suggestion-level or field-level provenance and lifecycle state. Row-level
manual provenance in Phase 1A is useful audit context but does not solve mixed manual/imported
provenance on its own.
