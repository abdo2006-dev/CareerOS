# Data Sources and Compliance

Status: **dated source-compliance registry**, current as of **2026-08-03** (Phase 2A.0 research
pass). Terms of service, `robots.txt` directives, and API behavior can change after this date —
this document should be re-verified against each source's current terms before its adapter is
enabled or re-enabled, not assumed permanently accurate. Findings below are labeled by confidence:
**confirmed** (verified against official documentation or a live, manual, low-volume request during
this pass), **inferred** (reasonable technical inference, not itself verified), or **unresolved**
(a real legal/compliance question this pass did not settle). No permission is invented where the
evidence does not support it — the precise phrases used below (*technically public*, *officially
documented*, *intended programmatic use*, *terms not fully resolved*, *blocked pending
clarification*, *manual import only*, *prohibited by identified terms*) are chosen deliberately and
are not interchangeable with "legally cleared."

## 1. Hard rule

No adapter may be built against a source whose terms of service prohibit automated
access/extraction. This explicitly rules out unauthorized scraping of LinkedIn, Indeed, or any
similarly restrictive platform, regardless of how easy it would be technically. This rule cannot be
overridden by user request — see [AGENTS.md](../AGENTS.md).

## 2. Source-adapter architecture

Every source is isolated behind an adapter implementing a common interface (fetch → normalize →
classify → return common-schema records). See [ADR-004](adr/ADR-004-source-adapter-architecture.md)
for the interface shape and [INGESTION_ARCHITECTURE.md](INGESTION_ARCHITECTURE.md) for the full
adapter/orchestrator design, lifecycle rules, and the source-onboarding checklist (§4 of that
document) — not duplicated here.

## 3. Source-compliance matrix

### Applicant-tracking-system (ATS) sources

#### Greenhouse Job Board API — **Implement first**

| Field | Finding |
|---|---|
| Category | Public ATS job-board API |
| Official documentation | `https://developers.greenhouse.io/job-board.html` |
| Access mechanism | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` |
| Authentication | None for GET endpoints — **confirmed**: the documentation states "Job Board data is publicly available, so authentication is not required for any GET endpoints." Only the application-submission POST endpoint requires a key |
| Intended use per documentation | "Build a custom job board or career site to post your jobs publicly for candidate applications"; export job-board data for custom career/application sites — **confirmed** |
| Geography/coverage | Global, per-employer board token; no cross-company discovery — one token per employer |
| Structured fields | `id`, `internal_job_id`, `requisition_id`, `title`, `absolute_url`, `location.name`, `offices[]`, `departments[]`, `updated_at`, `first_published`, `application_deadline`, `company_name`, `language`, `content` (HTML, entity-encoded), `metadata` — **confirmed**, observed live against a public board |
| Pagination/feed behavior | None needed — a single request returns the board's complete job list (observed: 129/129 jobs in one response for one board) — **confirmed** |
| Update/closure signals | `updated_at`, `first_published`, `application_deadline` present; closed posts simply disappear from the complete list, which is a reliable closure signal given the complete-response behavior — **confirmed / inferred for reliability** |
| Technical reliability | High — stable documented JSON, CDN-fronted — **inferred** |
| Terms/reuse status | **Technically public, officially documented, intended for career-site/job-board reuse.** No separate Job Board API terms-of-use document beyond the developer docs was found distinct from the intended-use description above — **unresolved**: whether a private, single-user archival use is squarely within "intended use" is not explicitly stated either way |
| Rate-limit risk | No documented rate limit for the Job Board API specifically — **confirmed that none is documented**; a conservative self-imposed limit is required regardless |
| Attribution requirement | None stated — **confirmed that none is stated** |
| `robots.txt` | `boards-api.greenhouse.io/robots.txt`: `User-agent: *` / `Disallow: /embed/` only — the Job Board API path is **not** disallowed — **confirmed** |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Implement first.** The adapter is restricted to explicitly configured, reviewed board tokens only (see [INGESTION_ARCHITECTURE.md](INGESTION_ARCHITECTURE.md) §10) and must never enumerate or probe arbitrary tokens |
| Reason | Unauthenticated, `robots.txt`-permitted, officially documented as intended for exactly this kind of reuse, complete-response semantics make closure detection reliable, and the strongest observed timestamp/identifier coverage of any source examined |

#### Lever Postings API — **Candidate for later**

| Field | Finding |
|---|---|
| Category | Public ATS job-board API |
| Official documentation | `https://github.com/lever/postings-api` |
| Access mechanism | `GET https://api.lever.co/v0/postings/{site}?mode=json` (separate EU instance: `api.eu.lever.co`) |
| Authentication | None for GET — **confirmed**. Application-submission POST requires an API key |
| Intended use per documentation | The official documentation explicitly documents this as a public postings API intended for third-party consumption and discusses building custom career pages against it — **confirmed** |
| Geography/coverage | Per-employer site name; separate global and EU instances must be configured explicitly |
| Structured fields | `id`, `text` (title), `categories{location,team,commitment,department,level}`, `description`, `hostedUrl`, `applyUrl`, `workplaceType`, optional `salaryRange` — **confirmed** from documentation. No documented update timestamp field |
| Pagination | `skip`/`limit` offset paging — **confirmed** |
| Update/closure signals | No documented update timestamp; closure inferred only from disappearance across paginated fetches — weaker than Greenhouse |
| Rate-limit risk | Documented only for the application-submission POST (429 above 2 req/s); no documented GET limit — **confirmed** |
| Terms/reuse status | **Officially documented, intended programmatic use** — the clearest "yes, third parties may consume this" documentation found among ATS sources |
| Attribution requirement | None found in the documentation reviewed |
| `robots.txt` | `api.lever.co/robots.txt`: `User-agent: *` / `Allow: /` / `Crawl-delay: 1` — explicitly permissive, with a stated delay to honor — **confirmed** |
| Coverage check | 15 plausible EU/German engineering-employer site names probed (single low-volume request each) — all returned HTTP 404; Lever's own demo board returned an empty result set — **confirmed** |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Candidate for later**, not the first adapter |
| Reason | The access basis is actually cleaner than Greenhouse's (explicit third-party-consumption documentation, a stated `Crawl-delay`), but Greenhouse has stronger observed timestamp coverage (`updated_at`, `application_deadline`) for the first implementation, and no relevant German/EU employer board was found live during this pass. Revisit once a Lever-hosted employer relevant to this user's geography/engineering areas is identified |

#### Workable public XML feed — **Later or rejected for the MVP**

| Field | Finding |
|---|---|
| Category | Public aggregate feed (all Workable customers) |
| Official documentation | Workable Help Center, "Utilizing the XML Job Feed" |
| Access mechanism | `GET https://www.workable.com/boards/workable.xml` |
| Authentication | None |
| Intended use per documentation | **Officially documented as intended for programmatic consumption** — explicitly described as a mechanism "to share this with a job board/partner Workable doesn't integrate with to programmatically get your job postings" |
| Geography/coverage | All published jobs across **every** Workable customer worldwide — the only genuinely cross-company discovery source examined |
| Structured fields | `title`, `date`, `referencenumber`, `url`, `company`, `city/state/country`, `remote`, `postalcode`, `description`, `education`, `jobtype`, `category`, `experience`, `website` — **confirmed** from documentation. No update timestamp beyond `date`, no deadline field |
| Pagination/feed behavior | **None** — the documentation states explicitly: "we don't support any filtering parameters on the feed; you should read/download the full file and filter on your end" — **confirmed** |
| Measured feed size (dated observation, not a contractual value) | **644,138,283 bytes uncompressed / 107,803,152 bytes gzipped, 132,490 `<job>` records**, measured 2026-08-03 in a single request; updated hourly per the documentation |
| Attribution requirement | Yes — **confirmed**: "job URLs must not be altered, as this affects source attribution" |
| `robots.txt` | `workable.com/robots.txt` does not disallow the feed path; also declares `Content-Signal: search=yes, ai-input=yes, ai-train=no` — **confirmed** |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Rejected for the first adapter; later reconsideration possible** |
| Reason | Bandwidth, parsing cost, and maintenance burden — extracting a handful of Bremen/Hamburg-relevant postings currently requires downloading and filtering ~108 MB gzipped locally on every refresh, which is a real, measured operational cost, not a theoretical one. This is a **dated operational observation about feed size**, not a permanent contractual limit — reconsider if streaming XML parsing is implemented and a clear coverage value is identified, or if Workable ever publishes a filtered/per-company endpoint |

#### SmartRecruiters Posting API — **Blocked pending clarification**

| Field | Finding |
|---|---|
| Category | Public ATS posting API, described for customers' own career sites |
| Official documentation | `https://developers.smartrecruiters.com/docs/posting-api`, `/docs/endpoints`, `/docs/authentication` |
| Access mechanism | `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` (list, with `country`/`region`/`city`/`department`/`language` filters) and `/postings/{postingId}` (detail) |
| Authentication per documentation | The Authentication page states API-key authentication is the supported method for the platform's APIs; the Posting API's own overview describes it as intended for **SmartRecruiters customers** building their own career sites and for **partners** building widgets |
| Observed behavior (single, low-volume, manual verification request per employer) | The list endpoint answered **without any credential** and returned real data — e.g. `BoschGroup` → `totalFound: 4714` (867 with `country=de`), `Continental` → `890` — **confirmed by direct observation** |
| Structured fields | `id`, `uuid`, `name`, `releasedDate`, `language`, `location{city,region,country,postalCode,latitude,longitude,remote,hybrid}`, `company{identifier,name}`, `department`, `industry`, `function`, `typeOfEmployment`, `experienceLevel`; detail adds `applyUrl`, `active`, `jobAd.sections{...}` — **confirmed**, observed live |
| Pagination | `limit`/`offset`; a requested `limit=200` was silently clamped to 100 — **confirmed** |
| Update/closure signals | No update timestamp beyond `releasedDate`; `active` boolean on the detail endpoint is the explicit closure signal |
| Known false-negative trap | An unknown/misspelled company identifier returns **HTTP 200 with `totalFound: 0`**, not 404 — verified with a deliberately fake identifier — **confirmed**. A zero result is not distinguishable from a wrong identifier by status code alone |
| `robots.txt` | `api.smartrecruiters.com/robots.txt`: `User-agent: LinkedInBot` → `Allow: /v1/companies/`; **`User-agent: * → Disallow: /`** — **confirmed** |
| Terms/reuse status | **Terms not fully resolved** — the documented API exists and answers unauthenticated requests in practice, but the documentation frames intended use as customer/partner career-site building, and the API host's own `robots.txt` disallows every user agent except one named crawler |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Blocked pending clarification. Do not implement.** Do not attempt to bypass the `robots.txt` restriction or argue around it by technical interpretation |
| Reason | A documented public API answering unauthenticated requests is not, by itself, sufficient authorization when the API domain's own `robots.txt` excludes general automated access. This is the single highest-coverage source found for this user's geography (Bosch, Continental) and is explicitly not implemented until one of: (a) written clarification from SmartRecruiters, (b) an appropriate credentialed/partner relationship, or (c) an explicit `robots.txt` change |

#### Personio XML feeds — **Candidate for later**

| Field | Finding |
|---|---|
| Category | Per-tenant public XML feed |
| Access mechanism | `GET https://{tenant}.jobs.personio.de/xml` (some tenants redirect to a custom domain or `.personio.com`) |
| Authentication | None observed |
| Structured fields (observed) | `id`, `name`, `jobDescriptions`, `department`, `office`, `additionalOffices`, `employmentType`, `schedule`, `seniority`, `yearsOfExperience`, `occupation`, `occupationCategory`, `recruitingCategory`, `subcompany`, `createdAt` |
| Update/closure signals | `createdAt` only — no update timestamp, no deadline field; weaker than Greenhouse |
| Terms/reuse status | **Terms not fully resolved** — no dedicated public API terms document was located during this pass; feed accessibility was only spot-checked, not reviewed against Personio's own terms |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Candidate for later**, pending a proper terms review |
| Reason | Personio is widely used by German small/mid-size engineering employers — exactly the Bremen/Hamburg gap Greenhouse does not fill — but a terms review has not yet been done, and its weaker timestamp fields make closure detection less reliable than Greenhouse's |

#### Workday (undocumented internal `/wday/cxs/` endpoint) — **Do not use**

| Field | Finding |
|---|---|
| Observed behavior | `POST https://ag.wd3.myworkdayjobs.com/wday/cxs/ag/Airbus/jobs` answered without authentication, `userAuthenticated: false`, `total: 2000`, minimal fields (`title`, `externalPath`, `locationsText`, `postedOn` as a relative string, `bulletFields`) |
| What this is | The internal endpoint that powers Workday's own career-site single-page application — **not** a published, documented third-party API |
| Terms/reuse status | **Public browser accessibility does not constitute a supported API.** No Workday developer documentation describing third-party use of this endpoint was found |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Do not use.** Do not implement this or any other undocumented SPA endpoint merely because it responds without authentication |
| Reason | This is precisely the case this registry exists to guard against: an endpoint being reachable is not the same as it being an intended, documented integration point |

#### SAP SuccessFactors career sites (e.g. Fraunhofer) — **Manual import only**

| Field | Finding |
|---|---|
| Observed | `jobs.fraunhofer.de` follows the standard SuccessFactors Recruiting Marketing career-site pattern (`/search/?createNewAlert=false`) |
| RSS/feed check | Three plausible RSS paths (`/rss`, `/rssfeed`, `/search/?...&rss=1`) all returned `text/html`, i.e. **no RSS** |
| Terms/reuse status | No vendor-level public posting API exists for SuccessFactors; each tenant's data is HTML only |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Manual import only** |

### Official public-sector and European sources

#### Bundesagentur für Arbeit Jobsuche — **Do not use**

| Field | Finding |
|---|---|
| What was tested | `GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs` with header `X-API-Key: jobboerse-jobsuche` — answered successfully (`maxErgebnisse: 777` for a sample query), with rich German-specific fields |
| Official API status | **No official public API exists.** The interface and its constant API key are documented only by a community project (`bundesAPI/jobsuche-api`); that project's own README states the BA "bietet ... bis heute keine offizielle API an" (offers no official API to date) |
| Terms of use (official, `arbeitsagentur.de/en/terms-of-use` §2a(3)) | **Explicitly prohibited by identified terms.** Quoted directly: *"use robots, web spiders or similar technologies, or to use existing communication or programming interfaces contrary to the BA's intended purpose, and thus to read out content from the portal or apps for the purpose of data collection and evaluation."* This describes exactly the intended use case here |
| Additional context | Public reporting (netzpolitik.org, 2021) documents the BA objecting to third-party mass use of this interface |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Do not use.** Do not use this or any unofficial wrapper, and do not use the extracted application API key |
| Reason | This is the single largest German vacancy database, and the coverage loss is real — recorded explicitly so a future contributor finding the community wrapper does not mistake technical availability for permission |

#### Make it in Germany — **Do not use**

| Field | Finding |
|---|---|
| `robots.txt` | Permissive (`Allow: /`) |
| Data source | Its job listings are sourced from the Bundesagentur für Arbeit Jobsuche database — **confirmed** from the portal's own description of itself |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Do not use** — inherits the BA data-access concern one hop removed; using an intermediary does not change the underlying compliance question, per [ADR-007](adr/ADR-007-compliant-data-sources.md) |

#### EURES — **Licensed/partner-only**

| Field | Finding |
|---|---|
| What was tested | `GET https://europa.eu/eures/api` → HTTP 401 |
| Official access | The genuinely documented EURES APIs are **input** APIs used by national public employment services to push vacancies *into* EURES, not a public retrieval API for third parties. Community "EURES API documentation" projects found during research explicitly disclaim European Commission affiliation |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Licensed/partner-only; do not use** for the MVP |
| Reason | No documented, acceptable public retrieval mechanism was found. Revisit only if the European Commission publishes one |

#### EURAXESS — **Manual import only**

| Field | Finding |
|---|---|
| Content relevance | High — research assistant, PhD, fellowship, and thesis-adjacent postings across Europe, filterable by country, research field, and career stage (R1–R4) |
| RSS/API check | `GET https://euraxess.ec.europa.eu/jobs/search/rss` → HTTP 404; no documented API or export was found |
| `robots.txt` | A stock Drupal file disallowing only `/core/` and `/profiles/` — permission-neutral, not itself a license to bulk-extract |
| Date reviewed | 2026-08-03 |
| **MVP decision** | **Manual import only** |
| Reason | No documented programmatic access exists; a future adapter needs an explicit reuse enquiry to the European Commission first, which this pass did not initiate |

#### European Job Days — **Manual import only**

`europeanjobdays.eu/robots.txt` is accessible (HTTP 200, permissive); no documented API or feed was
found. Event-shaped content belongs to the deferred development-opportunity category (roadmap
Phase 5), not Phase 2A. Date reviewed: 2026-08-03.

### Company career sites (target-employer research)

Single, low-volume, manual verification request per employer (HEAD/redirect check, plus a
SmartRecruiters/Greenhouse/Lever probe where plausible). Date reviewed: 2026-08-03.

| Employer | Finding | MVP decision |
|---|---|---|
| Bosch | SmartRecruiters `BoschGroup` (4,714 postings, 867 DE); own site `jobs.bosch.com/robots.txt` disallows `/en/` for all agents | Blocked (SmartRecruiters, see above) |
| Continental | SmartRecruiters `Continental` (890 postings) | Blocked (SmartRecruiters, see above) |
| Airbus | Undocumented Workday CXS endpoint (`ag.wd3.myworkdayjobs.com`) | Do not use (undocumented endpoint); manual import only |
| Siemens | `jobs.siemens.com` custom/Avature-style career site; no ATS API match | Manual import only |
| Infineon | `jobs.infineon.com/careers`; no ATS API match | Manual import only |
| Texas Instruments | `careers.ti.com` (Oracle Recruiting Cloud-shaped path); no ATS API match | Manual import only |
| NXP | No public path found matching any probed ATS; guessed careers path returned 404 | Manual import only |
| Deutsche Bahn | `karriere.deutschebahn.com` → `db.jobs`, custom site | Manual import only |
| Deutsche Telekom, Mercedes-Benz, BMW, Beckhoff, Phoenix Contact, Rohde & Schwarz, OHB, Rheinmetall, Hensoldt | Custom career sites; no ATS API match found | Manual import only |
| Fraunhofer institutes | SAP SuccessFactors, no RSS (see above) | Manual import only |
| DLR, University of Bremen, TU Hamburg (TUHH), Constructor University | Bespoke CMS career pages; guessed paths returned 404 | Manual import only |
| Greenhouse-hosted German deep-tech employers found during research | `helsing` (129 jobs, 107 German-location, 3 student-titled), `marvelfusion` (12, 10 German), `konux` (4, 4 German) | **Implement first** (Greenhouse) |

**Honest coverage caveat**: the confirmed Greenhouse German boards found during this pass skew
Munich/Berlin deep-tech, with very few student-level titles. A Greenhouse-only adapter delivers real
automated discovery but **not** meaningful Bremen/Hamburg student-role coverage on its own — that
gap is filled by manual import (Workflow 9,
[USER_WORKFLOWS.md](USER_WORKFLOWS.md#workflow-9--manually-adding-an-opportunity-phase-2a-see-adr-018)),
which is why both ship together at Phase 2A.1 rather than the adapter alone.

## 4. Rate-limiting and politeness (applies to every adapter)

- Respect `robots.txt` for any page-scraping adapter.
- Identify the ingestion job with a clear, honest User-Agent string, not a spoofed browser
  identity.
- Cache/reuse `last_checked_at` to avoid re-fetching unchanged pages more often than the ingestion
  cadence requires — under Phase 2A's manual local-CLI execution
  ([ADR-017](adr/ADR-017-local-first-ingestion-execution.md)), this simply means not re-running
  more often than useful, not a schedule to tune.
- Back off and log, rather than retry aggressively, on 429/5xx responses.

## 5. Adding a new source

See [INGESTION_ARCHITECTURE.md](INGESTION_ARCHITECTURE.md) §10 for the full, binding
source-onboarding checklist. In summary: read terms and `robots.txt`, determine intended audience,
record authentication/rate-limit/attribution requirements, define allowed endpoints/identifiers,
add synthetic fixtures and tests with no live-CI dependency, record a dated compliance entry in this
document, add the source with `enabled = false`, and receive explicit repository-owner approval
before enabling any real configuration.

## 6. Target-employer watchlist — resolved by this pass

The prior watchlist (Airbus, Siemens, NXP, Texas Instruments, OHB, Rohde & Schwarz, Bosch, Infineon,
Mercedes-Benz, DLR, Fraunhofer institutes, and other Bremen/Hamburg-area employers) has been
investigated; see the company career-sites table in §3 above for the per-employer finding and
decision. None of them are implemented as adapters yet — Bosch and Continental are the
highest-value target once the SmartRecruiters clarification (§3) is resolved; every other watchlist
employer is manual-import-only pending its own custom-site terms review if one is ever undertaken.

## 7. Source registry (implementation-time; none configured yet)

| Source | Category | Legal basis confirmed | Rate limit | Status |
|---|---|---|---|---|
| *(none configured yet — this table is populated at Phase 2A.1 implementation time, one row per registered `sources` entry, `enabled = false` until manually verified)* | | | | |
