# ADR-007: Compliant Data Sources Only

**Status**: Proposed

## Context

Broad opportunity coverage is tempting to build via scraping platforms like LinkedIn or Indeed,
which aggregate enormous numbers of postings — but both explicitly prohibit automated extraction
in their terms of service. The project brief is explicit that this must not be done regardless of
technical feasibility.

## Decision

No adapter is built against a source whose terms of service prohibit automated access. Sources are
limited to the categories in
[DATA_SOURCES_AND_COMPLIANCE.md](../DATA_SOURCES_AND_COMPLIANCE.md): direct company career pages
(terms permitting), public ATS job-board APIs (Greenhouse, Lever, and similar), public government/
EU job sources, public event APIs or feeds, university/organization calendars where access is
permitted, user-submitted links (single-page, user-initiated), and user-authorized email alerts
(future). Each source's terms-of-service basis is confirmed and recorded (see the source registry
in that document) before its adapter is enabled.

## Alternatives considered

- **Scrape LinkedIn/Indeed anyway, accept the legal risk**: rejected outright — this isn't a
  cost/benefit tradeoff the project is willing to make; it's excluded regardless of coverage
  benefit, consistent with the explicit instruction in the project brief and with
  [AGENTS.md](../../AGENTS.md)'s non-negotiable boundaries.
- **Third-party job-aggregator APIs that themselves scrape restricted platforms**: rejected for the
  same reason one level removed — using an intermediary doesn't change the underlying compliance
  problem if that intermediary's own data sourcing is itself non-compliant; any such API would
  need its own data-sourcing legitimacy confirmed, not assumed.

## Consequences

- MVP source coverage is narrower than "every posting on the internet," by design — the roadmap
  ([DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md)) starts with ATS job-board APIs precisely
  because they offer the best compliant coverage-to-effort ratio.
- Every new source addition carries a documentation obligation (recording its legal basis) before
  it's enabled, per [AGENTS.md](../../AGENTS.md) and
  [DATA_SOURCES_AND_COMPLIANCE.md](../DATA_SOURCES_AND_COMPLIANCE.md).
- This decision is treated as effectively non-reversible by ordinary implementation-time judgment
  calls — reversing it would require an explicit new ADR and, realistically, the user's direct
  sign-off given the legal exposure involved.
