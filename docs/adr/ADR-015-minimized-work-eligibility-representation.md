# ADR-015: Minimized Work-Eligibility Representation

**Status**: Proposed

## Context

Matching may need a small, user-confirmed work-eligibility signal, but collecting immigration
documents or narratives creates disproportionate privacy and legal risk.

## Decision

Store only a structured `eligibility_state` (`eligible`, `eligible_with_conditions`,
`requires_sponsorship`, or `unknown`), an optional weekly working-hour limit, and
`last_confirmed_at`. The value is self-reported and used for explainable matching, not legal
advice.

## Alternatives considered

- **Free-form immigration narrative**: rejected; it collects unnecessary sensitive detail and is
  difficult to apply consistently.
- **Detailed permit-document storage**: rejected; it would store government identifiers and scans
  with no Phase 1A need.
- **Minimal structured eligibility state**: chosen; it supports future eligibility checks while
  minimizing collection.

## Consequences

Never store passport numbers, residence-permit scans, government identifiers, unnecessary
immigration narrative, or legal conclusions presented as professional legal advice. The table is
highly sensitive user-owned data with direct `user_id` ownership and strict RLS.
