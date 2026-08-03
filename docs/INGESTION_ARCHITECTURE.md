# Ingestion Architecture

Status: **proposal** — the architecture new source adapters and the local ingestion CLI must
follow, per [ADR-004](adr/ADR-004-source-adapter-architecture.md) (adapter interface),
[ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) (TypeScript runtime),
[ADR-017](adr/ADR-017-local-first-ingestion-execution.md) (local-first execution), and
[ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md) (identity/dedup). No
code exists yet — this document governs Phase 2A.1's implementation, not a description of
something already built.

## 1. What exists today

Nothing. `ingestion/` contains only a placeholder `README.md`. This document, together with the
ADRs above and [DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md), is the design that
Phase 2A.1 (schema, first adapter, and local CLI, shipped together — see
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)) implements against.

## 2. Repository shape

`ingestion/` becomes a second, independent Node/TypeScript project — its own `package.json`,
`package-lock.json`, `tsconfig.json` — pinned to the same Node version as `app/` (`.nvmrc`). No npm
workspace and no package shared by import between `app/` and `ingestion/` at this stage; the
Postgres schema is the contract between them (see [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md)).

```
ingestion/
  src/
    adapters/           one module per adapter (e.g. greenhouse.ts)
    orchestrator.ts      shared fetch -> normalize -> identify -> upsert -> closure pipeline
    sanitize.ts          HTML sanitization (sanitize-html) + plain-text derivation
    identity.ts           URL normalization, content hashing
    cli.ts                entry point: `ingest`, `score` subcommands
  test/
    fixtures/             synthetic, public-safe recorded-shape fixtures (never real raw responses)
  package.json
  tsconfig.json
```

## 3. Source-adapter interface (per ADR-004)

```ts
interface SourceAdapter<Raw> {
  readonly adapterKey: string            // e.g. 'greenhouse'
  readonly adapterVersion: string        // e.g. 'greenhouse/1.0.0'
  readonly politeness: {
    minIntervalMs: number                // e.g. >= 1000ms between requests to one source
    maxRequestsPerRun: number
    userAgent: string                    // honest, non-spoofed, includes a contact URL
    timeoutMs: number                    // e.g. 15_000
    maxResponseBytes: number             // e.g. 8 MiB
  }

  validateConfig(config: unknown): AdapterConfig   // throws on unknown/extra keys
  fetchPage(cfg: AdapterConfig, cursor?: string): Promise<{
    records: unknown[]
    nextCursor?: string
    pageComplete: boolean                // did this page represent the source's full result set?
  }>
  parse(raw: unknown): Raw                          // hand-written type guard; throws on shape mismatch
  normalize(raw: Raw, cfg: AdapterConfig): NormalizedOpportunityVersion   // sanitizes, classifies
  identity(raw: Raw, cfg: AdapterConfig): {
    sourceExternalId: string
    canonicalUrl: string
    applicationUrl: string | null
  }
  provenance(cfg: AdapterConfig): { sourceKey: string; baseUrl: string }
}
```

An adapter's job is narrow, per [ADR-004](adr/ADR-004-source-adapter-architecture.md): turn one
source's data into the common schema. It never decides whether a listing is a new canonical
opportunity, a duplicate, or a match for an existing one — that is the identity/dedup step below,
which runs once, generically, after every adapter.

**Schema validation without a new dependency**: `parse()` is a hand-written type-guard function per
adapter, not a `zod` schema. One adapter with a modest field count does not justify a runtime
validation dependency, per [AGENTS.md](../AGENTS.md)'s "don't add dependencies casually." Adopt
`zod` only once a third adapter, or the first adapter with genuinely nested/branching response
shapes, makes hand-written guards unwieldy.

## 4. Orchestrator responsibilities (shared, written once)

The orchestrator — not any individual adapter — owns:

- Retry with exponential backoff **only on 429/5xx/network errors**, never on 4xx, honoring a
  `Retry-After` header when present.
- Enforcing each source's configured `politeness` interval and per-run request cap.
- Conditional requests (`If-None-Match`) where a source returns an `ETag`.
- The sanitization gate (see §7) before anything reaches normalization output.
- Content hashing and idempotent upsert, keyed on `(source_id, source_external_id)`.
- The identity/deduplication decision (§5).
- Version diffing against the current version (§6).
- Closure/freshness evaluation (§8).
- Writing one `ingestion_runs` row per invocation, with `completeness` set from whether every
  configured page was fetched successfully.
- Per-record failure isolation: one malformed record increments `error_count` and is skipped; it
  never fails the whole run.
- `--dry-run`: runs every step, including normalization, sanitization, and hashing, but wraps all
  writes in a transaction that is rolled back at the end — nothing persists.

**Logging discipline** (per [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) §9): IDs, counts,
timings, and error *types*/messages only. Never description text, never a full raw payload.
`ingestion_runs.error_summary` is capped (proposal: ≤ 32 entries, ≤ 8 KB total) and truncated
messages are marked as such, never silently cut.

## 5. Identity and deduplication (per ADR-010)

Applied once, generically, to every new or changed listing from every adapter:

1. **Already linked to a canonical opportunity?** Check whether captured content changed
   (`content_hash`); if so, insert a new `opportunity_version`; if not, only touch
   `source_listings.last_seen_at`.
2. **New, unlinked listing — strong deterministic match** (exact shared identifier scoped to the
   same employer, or byte-identical normalized application URL): auto-link to the existing
   canonical opportunity; insert a new version under it.
3. **Weak/uncertain match** (same organization, similar title, no exact identifier): **never
   auto-merge** — create a new, independent opportunity and a `potential_duplicate_links` row
   (`status = pending_review`).
4. **No match signal**: create a new opportunity and its first version.

No fuzzy/similarity-based automatic merging is implemented at any point in Phase 2A — a false merge
silently combines two postings' histories, which is worse than a visible, manually-resolvable
duplicate (see [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md) for the
full reasoning). The review-queue UI for confirming/rejecting a `pending_review` pair is deferred
past Phase 2A.1 — per [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), a second adapter that could
plausibly cover an already-covered employer is not enabled until that queue exists and works.

**URL normalization**: lowercase scheme+host, strip default port/fragment/userinfo, collapse
duplicate slashes, strip one trailing slash. Tracking-parameter handling is **per-adapter, via a
significance allowlist**, not a global blocklist — a query parameter that looks like tracking on one
source can be load-bearing identity on another (e.g., a job-ID query parameter). Each adapter
declares which parameters are significant; everything else is dropped and the remainder sorted for
stable comparison.

## 6. Versioning (per ADR-006)

Every mutable, historically-meaningful field lives on `opportunity_versions`, never on the stable
`opportunities` row (see [DATA_MODEL.md](DATA_MODEL.md)). A content change produces a new version
row; nothing is ever updated or deleted in place, at any role's privilege level — this is enforced
at the grant level (see [RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md)), not merely by adapter
discipline.

## 7. Sanitization (per SECURITY_AND_PRIVACY.md §6)

- HTML entities are decoded once (some sources double-encode), then sanitized with an **allowlist**
  (`sanitize-html`, npm — added under `ingestion/` only, justified per
  [AGENTS.md](../AGENTS.md) because hand-rolled HTML sanitization is a well-known way to ship an
  XSS bug): `p, br, ul, ol, li, strong, em, b, i, h3, h4, h5, h6, a[href]`. `a[href]` accepts only
  `https:`/`mailto:`; every other scheme (including `javascript:`, `data:`) drops the link, keeping
  its text.
- Unconditionally removed: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`,
  `<input>`, `<img>` (this removes tracking pixels), every `on*` handler, every `style` attribute,
  every `data-*` attribute, all comments.
- Plain text is derived from the **sanitized** tree, not the raw string — deriving it from raw text
  first can let stripped-tag content leak back in.
- The frontend renders the sanitized plain text; storing sanitized limited HTML alongside it is
  optional groundwork for later rich rendering, but the MVP never uses
  `dangerouslySetInnerHTML`-equivalent rendering on any of it — defense in depth per
  [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) §6.
- Raw, unsanitized responses are discarded after normalization completes, consistent with
  [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy) — they are not part of
  this product's durability promise.

## 8. Freshness and conservative closure

Statuses: `active`, `closed`, `stale`, `unknown` — at both the listing and canonical level.

- **Only a run whose `completeness = 'complete'` may mark anything absent.** A partial or failed
  run updates `last_seen_at` for what it did see and closes nothing.
- A run is `complete` only if the adapter reports it enumerated the full source **and** a sanity
  gate passes: `fetched_count` is not an anomalous collapse versus a rolling recent baseline for
  that source (see [OBSERVABILITY.md](OBSERVABILITY.md) §4) — a board dropping from 129 to 0 is
  treated as a source failure needing review, not as 129 closures.
- Absence from a `complete` run increments a per-listing absence counter; a listing becomes
  `closed` only after **two consecutive** complete-run absences, so one anomalous complete run
  cannot close an entire board.
- A source that explicitly marks a listing closed (an explicit `active: false`-style field, or an
  HTTP 404 on the canonical URL) closes it immediately — explicit beats inferred.
- **The canonical opportunity is `closed` only when every linked listing is `closed`**
  ([USER_WORKFLOWS.md](USER_WORKFLOWS.md) Workflow 7).
- A source disabled in the registry (`sources.enabled = false`) moves its listings to `unknown`,
  never `closed` — disabling an adapter is a CareerOS decision and says nothing about the employer.
- Reappearance resets the absence counter and returns the listing to `active`.
- A passed `application_deadline` is a derived display flag, never a status — conflating "employer
  withdrew it" with "the stated date elapsed" would destroy a distinction the product depends on.

**Never mark all unseen listings closed after a failed or incomplete run.** This is the single most
important safeguard in this document; every other rule above exists to make it concrete and
testable.

## 9. First adapter: Greenhouse

Chosen because, per the source research in
[DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md): unauthenticated and documented as
public for GET endpoints; its `robots.txt` permits the Job Board API path; one request returns the
**complete** board with full descriptions, which makes closure detection reliable rather than
heuristic; and it is the only source examined that carries all four of `posted_at`,
`source_updated_at`, `application_deadline`, and a stable requisition identifier.

Configuration is a `sources` row per registered board token — adding an employer already on
Greenhouse is a configuration change, not new code, per
[ADR-004](adr/ADR-004-source-adapter-architecture.md). The adapter must **not** enumerate or probe
arbitrary board tokens during normal operation; it only ever fetches boards explicitly configured
and reviewed (see §10).

## 10. Adding a new adapter safely (contribution checklist)

No adapter may be enabled merely because an endpoint responds. Before any new source is enabled:

1. Identify the source's official documentation (or explicitly note that none exists).
2. Read its current terms of use and `robots.txt`.
3. Determine who the interface is actually intended for (public consumers, a named partner
   program, a specific crawler) — a response with HTTP 200 is not evidence of intended audience.
4. Record authentication requirements.
5. Record any documented rate limits (and choose a conservative self-imposed limit where none are
   documented).
6. Record attribution requirements, if any.
7. Define the allowed endpoints and, for per-employer sources, the allowed board/company
   identifiers — no adapter may reach an unconfigured endpoint or identifier.
8. Define the retention policy for anything the adapter captures (see §7 and
   [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy)).
9. Add synthetic, public-safe fixtures — never a captured real response verbatim (see
   [TESTING_STRATEGY.md](TESTING_STRATEGY.md) §6).
10. Add adapter tests with no live-network dependency in CI.
11. Add a dated entry to the source-compliance registry
    ([DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md)) recording everything above.
12. Add the source to the `sources` table with `enabled = false`.
13. **Receive explicit repository-owner approval** before setting `enabled = true` on any real
    employer/board configuration.

This checklist is binding per [AGENTS.md](../AGENTS.md)'s "no unauthorized scraping" rule and
[ADR-007](adr/ADR-007-compliant-data-sources.md) — it is not optional guidance for a source that
"looks scrapeable."

## 11. Manual import is not a generic fetcher

Per [ADR-018](adr/ADR-018-private-manual-opportunities.md) and
[SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) §7, Phase 2A builds **no** generic server-side
URL fetcher. Manual entries are metadata the user confirms themselves; a URL matching a configured
adapter's own pattern may be recognized and routed to that specific adapter (already scoped to its
own registered host), but nothing fetches an arbitrary, unrecognized URL automatically. The SSRF
control set in [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) §7 is the required design *if and
when* a generic fetcher is ever proposed — it is not implemented now, and this document does not
authorize building it.

## 12. Testing summary

See [TESTING_STRATEGY.md](TESTING_STRATEGY.md) §4 for the full list. In brief: fixture-based adapter
unit tests (pagination, malformed records, duplicate IDs, closed records, hostile HTML, URL
normalization, content-hash stability), orchestrator integration tests against a local mock HTTP
server (`node:http`) covering retry/backoff/timeout/partial-page/idempotent-rerun/conservative
closure, and no live third-party network call anywhere in CI.
