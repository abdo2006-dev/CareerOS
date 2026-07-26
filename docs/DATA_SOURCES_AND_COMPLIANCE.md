# Data Sources and Compliance

Status: **proposal** for the source categories and specific example sources; the exact source list
for the MVP should be finalized (and its terms of service actually read) before any adapter is
built — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## 1. Hard rule

No adapter may be built against a source whose terms of service prohibit automated
access/extraction. This explicitly rules out unauthorized scraping of LinkedIn, Indeed, or any
similarly restrictive platform, regardless of how easy it would be technically. This rule cannot be
overridden by user request — see [AGENTS.md](../AGENTS.md).

## 2. Source-adapter architecture

Every source is isolated behind an adapter implementing a common interface (fetch → normalize →
classify → return common-schema records). See
[ADR-004](adr/ADR-004-source-adapter-architecture.md) for the interface shape. This means adding
or removing a source never touches scoring, storage, or frontend code, and each source's specific
legal/operational profile is documented independently, below.

## 3. Source categories, prioritized as instructed

### Direct company career pages

- **What**: individually scraping/parsing a specific company's own public careers page, or using
  the company's own published feed/API if one exists.
- **Legal basis**: a company's own public career page generally permits normal, low-volume,
  robots.txt-respecting access for the purpose of finding their own job postings; this must be
  confirmed per-site (check `robots.txt` and terms of use) before an adapter is added, not assumed.
- **Operational concerns**: no shared schema across companies — every company page needs its own
  parsing logic, which is the highest-maintenance source type. Pages change layout without notice.
- **Reliability**: lowest — most likely to break silently. Ingestion must log parse failures per
  adapter clearly (see [OBSERVABILITY.md](OBSERVABILITY.md)) rather than fail the whole run.
- **Recommended MVP use**: pick a small number (2-5) of specific target companies/employers
  relevant to the user's engineering areas and Bremen/Hamburg/international focus, rather than
  attempting broad coverage.

### Public applicant-tracking-system (ATS) job-board endpoints

- **What**: Greenhouse and Lever both publish structured, public job-board JSON endpoints intended
  for exactly this kind of consumption (many companies expose `boards-api.greenhouse.io/v1/boards/<org>/jobs`
  style endpoints, and similarly for Lever); some other ATS platforms (Workday, SmartRecruiters,
  Personio) offer comparable public or semi-public listing endpoints depending on the employer's
  configuration.
- **Legal basis**: these are the ATS vendor's own public API surface, designed for external
  consumption. Still confirm each vendor's API terms of use and any documented rate limits.
- **Operational concerns**: one adapter per ATS vendor (not per company) covers every company using
  that vendor — this is the best effort-to-coverage ratio of any source category and should be the
  first adapters built.
- **Reliability**: high — stable, documented, structured JSON.
- **Recommended MVP use**: primary source category for the MVP.

### Public government or European job sources

- **What**: e.g., Germany's Bundesagentur für Arbeit job search (which has historically offered
  API access for developers), EURES (the EU's public employment portal), or similar official
  sources.
- **Legal basis**: public-sector job portals generally intend third-party/API consumption but
  usually require registration for an API key and have documented usage terms — must be confirmed
  and, where required, an API key obtained before building the adapter.
- **Operational concerns**: broader coverage but noisier relevance (not engineering- or
  student-specific by default) — normalization/classification logic carries more weight here.
- **Reliability**: generally high (public institutional infrastructure), but subject to
  government-system quirks (maintenance windows, slower API evolution).

### Public event APIs or feeds, university and organization calendars

- **What**: hackathon/competition listing platforms with public APIs, Constructor University's own
  public event pages/calendars, professional-society (e.g., VDE, IEEE student branch) event
  listings where publicly accessible.
- **Legal basis**: public calendar/event pages are typically intended for public consumption;
  confirm terms where an API key or registration is involved.
- **Operational concerns**: primary source for development opportunities (hackathons,
  scholarships, workshops, career fairs).
- **Reliability**: variable by source; university calendar formats and small-organization sites
  change without notice more than established ATS platforms.

### User-submitted links

- **What**: the user pastes a URL to a specific posting the pipeline hasn't ingested from a
  configured source.
- **Legal basis**: the user is the one initiating the individual fetch of a page they chose to
  view, for their own personal archival use — closer to a personal bookmarking/archiving action
  than automated bulk extraction, but the fetch must still respect the target site's `robots.txt`
  and must never be used to bulk-crawl beyond the single submitted page.
- **Operational concerns**: needs its own lightweight parser (best-effort structured extraction,
  falling back to storing the sanitized raw text if structured fields can't be reliably
  identified) since it isn't tied to any known adapter's schema.
- **Security concerns**: this is the primary SSRF risk surface — the fetch must validate the URL
  (reject internal/private IP ranges, non-http(s) schemes) before making any server-side request.
  See [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md).

### User-authorized email alerts

- **What**: the user forwards or connects an email-based job-alert subscription they already
  receive (e.g., a company's own "new jobs" newsletter they signed up for).
- **Legal basis**: the user already consented to receive this content directly; parsing an email
  the user explicitly forwards or grants access to is materially different from scraping a
  platform that prohibits it.
- **Operational concerns**: deferred past MVP — requires either an email-forwarding intake address
  or an OAuth mail-read integration, both of which are real scope (see
  [MVP_SCOPE.md](MVP_SCOPE.md)). Documented here as a future adapter category, not built yet.

## 4. Rate-limiting and politeness (applies to every adapter)

- Respect `robots.txt` for any page-scraping adapter.
- Identify the ingestion job with a clear, honest User-Agent string, not a spoofed browser
  identity.
- Cache/reuse `last_checked_at` to avoid re-fetching unchanged pages more often than the ingestion
  cadence requires (see [DATA_FLOW.md](DATA_FLOW.md)).
- Back off and log, rather than retry aggressively, on 429/5xx responses.

## 5. Adding a new source (process, for future agents/contributors)

1. Read the source's terms of use / API documentation; confirm automated access is permitted.
2. Record the source, its legal basis, and any rate-limit constraints in the table below.
3. Implement one adapter module conforming to the common interface
   ([ADR-004](adr/ADR-004-source-adapter-architecture.md)).
4. Add it to the `sources` table (see [DATA_MODEL.md](DATA_MODEL.md)) with `enabled = false` until
   manually verified against real data.

## 6. Target-employer watchlist (proposed, not approved)

The user has named the following employers as ones of real interest, reflecting the ECE
engineering-area focus and the Bremen/Hamburg/international priorities in
[PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md): **Airbus, Siemens, NXP, Texas Instruments,
OHB, Rohde & Schwarz, Bosch, Infineon, Mercedes-Benz, DLR, Fraunhofer institutes**, and other
relevant employers around Bremen and Hamburg.

**This is a watchlist of candidates to investigate, not a list of cleared or implemented data
sources.** None of these companies' recruitment systems have been verified as compliant sources,
and no adapter for any of them exists. Before any one of them is turned into an adapter:

1. Identify what recruitment/ATS platform they actually use today (a company on this list may use
   its own custom career site, or a third-party ATS such as Greenhouse, Lever, Workday,
   SmartRecruiters, SAP SuccessFactors, or another — this varies per company and changes over
   time, so it must be checked, not assumed).
2. If they use a known ATS with a public job-board API (see §3's "Public
   applicant-tracking-system (ATS) job-board endpoints" category), the existing generic adapter
   for that ATS vendor likely covers them with just a configuration entry, not new code.
3. If they run a custom career page, read that page's `robots.txt` and terms of use, and treat it
   under §3's "Direct company career pages" category — including its higher maintenance and
   reliability cost.
4. Record the outcome in the source registry below, with `enabled = false` until the adapter is
   actually built and manually verified.

Large multinational engineering employers (Airbus, Siemens, Bosch, Infineon, NXP, Texas
Instruments, Mercedes-Benz) are more likely to run on a standard ATS with a public API; German
public research/space organizations (DLR, Fraunhofer) and mid-size specialists (OHB, Rohde &
Schwarz) may be more likely to run custom career pages requiring per-site verification — but this
is a planning-time expectation to verify, not a confirmed fact about any of them.

## 7. Source registry (to be filled in during implementation)

| Source | Category | Legal basis confirmed | Rate limit | Status |
|---|---|---|---|---|
| *(none configured yet, including none of the watchlist employers above — this is a planning-phase placeholder table, not a claim that any adapter exists or that any source's compliance has been verified)* | | | | |
