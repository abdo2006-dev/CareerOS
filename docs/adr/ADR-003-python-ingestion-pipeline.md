# ADR-003: Python Ingestion Pipeline

**Status**: Superseded by [ADR-016](ADR-016-typescript-ingestion-runtime.md) for
ingestion/normalization and deterministic opportunity scoring — see that ADR for the exact scope of
the supersession. This ADR's original rationale is left unchanged below as historical context: it
correctly anticipated needs (resume parsing, market-skill aggregation) ADR-016 does not touch, and
those remain open, undecided questions for their own future phases, not settled by either ADR.

## Context

Ingestion (source adapters, HTML sanitization/normalization), resume parsing (structured
extraction from PDF/DOCX), and scoring (deterministic sub-score computation, later market
aggregation and possibly embeddings) are all data-processing-heavy, text-heavy, and likely to grow
ML-adjacent capability over time (better resume parsing, semantic skill matching). This work runs
as scheduled batch jobs, not inside the user-request path (see
[ADR-002](ADR-002-frontend-and-backend-boundaries.md)).

## Decision

Use **Python** for the entire ingestion/parsing/scoring codebase (`ingestion/` in the repository
layout, see [ARCHITECTURE.md](../ARCHITECTURE.md)), run by scheduled GitHub Actions workflows.

## Alternatives considered

- **Node.js**: would unify the stack on one language with the React frontend, but Python's
  ecosystem for HTML parsing/sanitization, PDF/DOCX text extraction, pandas-based aggregation, and
  future NLP/embeddings work is deeper and better-documented for exactly these tasks. The frontend
  and the batch pipeline are separate deployables with no shared code today, so "one language
  everywhere" offers little practical benefit here.
- **Go or another compiled language**: would offer performance/deployment-simplicity benefits
  irrelevant at this data volume (low thousands of records, jobs running in minutes), at the cost
  of a much thinner data/text/ML ecosystem for this specific workload.

## Consequences

- A single Python codebase covers source adapters, normalization, resume parsing, and scoring,
  sharing common utilities (the opportunity schema types, sanitization helpers) across all three.
- Dependencies are pinned via a lockfile; per [AGENTS.md](../../AGENTS.md), new dependencies are
  added deliberately, not casually, since each one is a maintenance and security surface for a
  single maintainer.
- This choice is independent of, and does not predetermine, the language of any future synchronous
  API layer (see [ADR-002](ADR-002-frontend-and-backend-boundaries.md)) — though Python (FastAPI)
  remains the natural fallback there specifically because it would reuse this same codebase's
  logic.
