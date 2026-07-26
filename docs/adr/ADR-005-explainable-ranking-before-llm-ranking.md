# ADR-005: Explainable Ranking Before LLM Ranking

**Status**: Proposed

## Context

The product's core value proposition includes telling the user *why* an opportunity is or isn't a
good fit, traceable to specific profile evidence and specific requirement text (see
[PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md) and
[SCORING_AND_MATCHING_MODEL.md](../SCORING_AND_MATCHING_MODEL.md)). An LLM could, in principle,
read a resume and a job posting and produce a plausible-sounding fit judgment directly — but that
judgment would not be reliably traceable, reproducible, or auditable, and could vary between runs
on identical input.

## Decision

Scoring and ranking follow a strict layered order that an LLM is not permitted to skip or replace
outright: deterministic parsing/normalization → hard eligibility rules → transparent weighted
scoring → search/embeddings where useful → LLM explanation **only after** grounded, deterministic
evidence already exists. An LLM may turn an already-computed score and its evidence into readable
prose; it may never be the sole source of the score or category itself.

## Alternatives considered

- **LLM-first matching** (feed resume + posting to an LLM, ask for a fit score): faster to
  prototype, but produces an unreproducible, unauditable number that cannot satisfy the
  explainability requirement, and risks prompt injection from posting text influencing the output
  in unintended ways (see [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)).
- **Hybrid with LLM as a tiebreaker inside the scoring function itself**: still couples the
  authoritative score to a non-deterministic call; rejected for the same auditability reason,
  though embeddings-based similarity (deterministic given a fixed model/version) is accepted as
  stage 4 precisely because it's reproducible and inspectable in a way free-form LLM judgment
  is not.

## Consequences

- Every score shown to the user has an inspectable evidence trail (`evidence_jsonb` in
  [DATA_MODEL.md](../DATA_MODEL.md)) before any LLM is ever involved.
- LLM use, when eventually added (Phase 7 of
  [DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md)), is additive presentation, not a scoring
  dependency — the system remains fully functional and explainable with the LLM step disabled.
- This also directly enforces the project's rule against presenting a competitiveness score as a
  calibrated acceptance probability: the scoring stages produce heuristic alignment estimates,
  never a probability, and no stage introduces outcome-based prediction without the explicit,
  separately-decided step described in
  [SCORING_AND_MATCHING_MODEL.md](../SCORING_AND_MATCHING_MODEL.md).
