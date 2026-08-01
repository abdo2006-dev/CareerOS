# ADR-011: Manual Profile Before Resume Extraction

**Status**: Proposed

## Context

A combined profile-and-parser phase would make the first useful profile dependent on file upload,
asynchronous processing, extraction quality, and a review workflow. A resume-first design also
risks making a parsed document look authoritative before the destination model and manual editing
experience have been proven.

## Decision

Split the work into separate planning units, branches, pull requests, and exit conditions:

- **Phase 1A — structured manual career profile**: build and validate the matching-ready profile
  through independent manual sections. It includes no resume upload, extraction, background
  parsing, or imported suggestions.
- **Phase 1B — resume intake and extraction drafts**: after Phase 1A is stable, resume parsing
  produces separately reviewable suggestions against the confirmed Phase 1A model.

The manual profile is the destination and source of truth. Extraction is an assistive input later,
never the model-defining feature.

## Alternatives considered

- **Combined profile/parser phase**: rejected because it couples basic profile validation to an
  asynchronous, higher-risk integration.
- **Resume-first design**: rejected because it obscures whether the model is useful without a
  particular document and makes correction workflows foundational too early.
- **Manual structured profile first**: chosen because it validates the intended matching inputs,
  section editing, completeness feedback, and authorization model in the smallest useful slice.

## Consequences

Phase 1A does not create resume tables, storage, parser jobs, extraction columns, or suggestion
tables. Phase 1B must revisit provenance at field/suggestion level: row-level `created_via` alone
cannot represent a row with both manually confirmed and resume-assisted information.
