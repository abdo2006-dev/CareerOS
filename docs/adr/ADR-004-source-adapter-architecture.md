# ADR-004: Source-Adapter Architecture

**Status**: Proposed

## Context

The project must ingest from a deliberately heterogeneous set of source categories — ATS job-board
APIs, direct company career pages, public government job portals, event calendars, user-submitted
links (see [DATA_SOURCES_AND_COMPLIANCE.md](../DATA_SOURCES_AND_COMPLIANCE.md)) — each with
different data shapes, legal bases, rate limits, and failure modes. Scoring, storage, and the
frontend must not need to know which source a given opportunity came from.

## Decision

Every external source is accessed through an **adapter** implementing a common interface:

```
fetch()      -> raw source-specific records
normalize()  -> records mapped into the common opportunity schema (see DATA_MODEL.md),
                with content sanitized and category/subtype classified
identify()   -> a stable identity key per record (source-provided ID, or URL+content hash),
                used for idempotent source_listings upsert and version-diffing
```

An adapter's output is a **source listing plus a candidate version** — it is explicitly not
responsible for deciding whether the listing represents a new canonical opportunity or an
already-known one from a different source. That decision (auto-link on strong evidence, flag for
review on weak evidence, or create new) is the identity/deduplication step described in
[ADR-010](ADR-010-opportunity-identity-and-cross-source-deduplication.md), and it runs once,
generically, after every adapter — never inside an individual adapter. This keeps an adapter's job
narrow and testable in isolation: turn this one source's data into the common schema, nothing
more.

An orchestrator runs each enabled adapter (from the `sources` table) on its schedule, calls
`fetch → normalize → identify`, then hands the result to the shared upsert → identity/dedup →
version-diff → removal-detection pipeline in [DATA_FLOW.md](../DATA_FLOW.md), generically, once,
for every adapter — that logic does not live inside individual adapters.

## Alternatives considered

- **One monolithic ingestion script per source, without a shared interface**: faster to write
  the first adapter, but every subsequent adapter would re-implement upsert/versioning/
  classification logic slightly differently, and a bug fix in that shared logic would need to be
  applied N times. Rejected as it directly contradicts the project's explicit requirement for
  adapter isolation.
- **A plugin system with dynamic adapter discovery/registration**: unnecessary complexity at a
  handful of adapters; a simple registry (the `sources` table plus a Python module per
  `adapter_key`) is sufficient and easier to reason about.

## Consequences

- Adding or removing a source is isolated to one adapter module plus one `sources` row; it never
  requires touching scoring, frontend, or deduplication code — the same real-world posting
  appearing through a new source is handled entirely by the shared identity/dedup step, not by
  anything source-specific.
- A source-specific parsing break (e.g., a company's career page changes its HTML structure) fails
  loudly for that one adapter's run (`ingestion_runs.error_summary`) without affecting other
  sources' runs.
- Per [AGENTS.md](../../AGENTS.md), this boundary is explicitly called out as one coding agents
  must not blur — source-specific fields or scraping logic must never leak into scoring or
  frontend code.
