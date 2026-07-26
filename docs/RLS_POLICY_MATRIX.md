# Row Level Security Policy Matrix

Status: **proposal**. This is the authoritative, table-by-table (and bucket-by-bucket)
authorization reference for the schema in [DATA_MODEL.md](DATA_MODEL.md). Where this document and
prose elsewhere disagree, this document wins — prose descriptions elsewhere should link here
rather than restate permissions. Per [AGENTS.md](../AGENTS.md) and
[TESTING_STRATEGY.md](TESTING_STRATEGY.md), every row in this matrix implies a required automated
isolation test, and no migration that touches a table's RLS policy is complete without updating
both this file and its corresponding test.

## How to read this matrix

- **Browser SELECT/INSERT/UPDATE/DELETE** describe what the frontend, acting as the signed-in
  user via their own session JWT (the Supabase anon key + user session, never the service-role
  key), is permitted to do — enforced by Postgres RLS policies, not by frontend code.
- **Service-role access** describes what the ingestion/parsing/scoring jobs (holding the
  service-role key, see [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)) are permitted to do.
  The service-role key bypasses RLS by design in Supabase/Postgres — its scope is controlled by
  which jobs actually hold it and what those jobs' code does, not by an RLS predicate. It must
  never reach the browser.
- **Expected RLS predicate** is the logical condition a policy must enforce — written here as a
  proposal for the migration author to implement, not final SQL.
- **Anonymous access** answers whether a wholly unauthenticated request (no session at all) can
  read or write anything. For the private MVP this is **No** everywhere without exception; this
  column exists so that if public read access is ever deliberately introduced (e.g., a public
  opportunity board at the multi-user launch phase — see
  [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)), that is a visible, deliberate change to this
  table, not a silent default.
- **Some shared/global rows need a narrow, user-triggered write** (confirming a potential
  duplicate is the one case in this schema). These are **not** given as a direct table-level
  UPDATE grant to authenticated users, because that would let any authenticated user rewrite
  arbitrary fields on shared data. Instead, they go through a `SECURITY DEFINER` Postgres function
  that performs exactly one narrow, validated state transition (e.g., "mark this specific
  `potential_duplicate_links` row `confirmed_duplicate` and propagate the merge") and nothing
  else. This pattern is called out explicitly wherever it applies below.
- **Sensitivity level**: `Low` (non-personal, public, or purely operational data), `Medium`
  (personal but low-consequence if exposed), `High` (personal and consequential if exposed —
  career/education/eligibility data), `Very High` (resume file content, or data revealing
  eligibility/immigration status specifically).

## Profile domain (user-owned)

| Table(s) | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `profiles`, `education_entries`, `work_experience`, `projects`, `user_skills`, `user_languages`, `preferences` | One row/set per user; child tables reference the owning user via `profile_id = auth.uid()` | Own rows only | Own rows only | Own rows only | Own rows only | Full (admin/export/account-deletion tooling) | `user_id = auth.uid()` (on `profiles`); `profile_id = auth.uid()` (on child tables) | No | User A cannot SELECT, INSERT (for A's `profile_id`), UPDATE, or DELETE any row owned by user B; User A has full CRUD on their own rows | High (`profiles.work_eligibility` in particular reveals immigration/visa status — treat as Very High for that column specifically) |
| `skills_catalog` | Shared reference data (skill names), not user-owned | All authenticated users | No (service-role only, grown by ingestion/normalization) | No | No | Full | None (public reference table, but still gated behind authentication for MVP) | No | Any authenticated user can read the full catalog; no authenticated user can write to it | Low |

## Resume domain (user-owned)

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `resumes` | One row per uploaded resume, owned by the uploading user | Own rows only | Own rows only (creates the `pending` record at upload time) | **No** — `status`, `claimed_at`, `claimed_by_run_id` are job-owned fields; the browser never updates this row directly (a corrected resume is a new upload, not an edit) | Own rows only | Full (claim, process, mark `completed`/`failed`) | `user_id = auth.uid()` | No | User A cannot SELECT or DELETE user B's resume record; user A cannot UPDATE any resume row (including their own) via the browser role at all | Very High (references the actual resume file) |
| `resume_extractions` | Raw parser output for one resume, owned transitively via `resume_id → resumes.user_id` | Own rows only (to review the draft) | No (written only by the parsing job) | No | No | Full | `resume_id IN (SELECT id FROM resumes WHERE user_id = auth.uid())` | No | User A cannot SELECT user B's extraction; user A cannot INSERT/UPDATE/DELETE any extraction row, including their own, via the browser role | Very High |

## Opportunity identity and content domain (shared/global)

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `sources` | Shared adapter/source registry | All authenticated users | No | No | No | Full | None (shared read, service-role write) | No | Any authenticated user can read; no authenticated user can write | Low |
| `source_listings` | Shared — one row per (source, external_id) observation | All authenticated users | No | No | No | Full | None | No | Same as above | Low |
| `opportunities` | Shared — canonical, real-world opportunity identity/status | All authenticated users | No | **No direct grant.** The one legitimate user-triggered change (confirming a duplicate merge) goes through the `confirm_potential_duplicate(...)` `SECURITY DEFINER` function described in [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md), which is the only path allowed to set `status = merged_duplicate` / `merged_into_opportunity_id` | No | Full | None (shared read; writes via service-role or the one narrow function) | No | Any authenticated user can read; no authenticated user can perform a raw UPDATE/INSERT/DELETE; the merge-confirmation function only ever touches the exact row pair it's called with | Low (identity/status metadata only — no descriptive content lives here) |
| `opportunity_versions` | Shared — immutable content snapshots | All authenticated users | No | No (never — immutability is enforced at the RLS/grant level, not just by convention; see [ADR-006](adr/ADR-006-posting-version-history.md)) | No | Insert-only (no service-role UPDATE/DELETE either, by policy, to make the immutability guarantee structural rather than merely a code convention) | None (shared read; append-only writes via service-role) | No | Any authenticated user can read; no role — including service-role — can UPDATE or DELETE an existing row; new content only ever arrives as a new row | Low–Medium (contains sanitized third-party posting text) |
| `potential_duplicate_links` | Shared — pending/resolved duplicate-review flags | All authenticated users | No (created only by the ingestion/dedup step) | **No direct grant.** Confirm/reject goes through the same `confirm_potential_duplicate(...)` / `reject_potential_duplicate(...)` `SECURITY DEFINER` functions, which validate the row exists, is `pending_review`, and belongs to a legitimate pair before changing its status | No | Full | None (shared read; controlled write via function) | No | Any authenticated user can read the queue; no authenticated user can set `status` via a raw UPDATE — only via the review function, and only to `confirmed_duplicate`/`rejected` | Low |
| `career_market_scores` | Shared — Ranking 1, not user-specific | All authenticated users | No | No | No | Full | None | No | Any authenticated user can read; no authenticated user can write | Low |
| `ingestion_runs` | Shared — operational log | All authenticated users (surfaces staleness/duplicate-queue depth per [OBSERVABILITY.md](OBSERVABILITY.md)) | No | No | No | Full | None | No | Any authenticated user can read; no authenticated user can write; `error_summary` content is checked (by convention + a test) to never contain resume text or profile field values | Low (must never contain personal data — see [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)) |
| `market_skill_mentions` | Shared — aggregate market-intelligence snapshot | All authenticated users | No | No | No | Full | None | No | Any authenticated user can read; no authenticated user can write | Low (aggregate/anonymized by construction) |

## User activity domain (user-owned)

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `saved_opportunities`, `applications`, `tasks` | One row per user action, owned directly via `user_id` | Own rows only | Own rows only | Own rows only | Own rows only | Full (admin/export/account-deletion) | `user_id = auth.uid()` | No | User A cannot SELECT/INSERT/UPDATE/DELETE any row owned by user B; full CRUD on own rows | High (reveals job-search targets, strategy, and status — treat application/task content as sensitive career-strategy data) |
| `interview_prep_notes` | Owned transitively via `application_id → applications.user_id` (a denormalized `user_id` column on this table is recommended purely to keep the RLS predicate simple and avoid a subquery on every policy check) | Own rows only | Own rows only | Own rows only | Own rows only | Full | `user_id = auth.uid()` (denormalized) or `application_id IN (SELECT id FROM applications WHERE user_id = auth.uid())` if not denormalized | No | Same isolation test pattern as above | High (may contain candid personal notes on interview performance/strategy) |
| `career_fit_scores`, `development_scores` | User-specific scores against a shared opportunity version | Own rows only | No (written only by the scoring job) | No | No | Full | `user_id = auth.uid()` | No | User A cannot SELECT any score row belonging to user B; user A cannot write any score row via the browser role, including their own | High (`eligibility_status` in particular can reveal immigration/visa-driven exclusion — treat as sensitive personal-attribute data) |

## Storage buckets

| Bucket | Owner / data type | Browser read | Browser write (upload) | Browser delete | Service-role | Expected policy | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|
| `resumes` (private bucket) | User-uploaded resume files, path-scoped per user (e.g. `{user_id}/{resume_id}.pdf`) | Own path only, via a short-lived signed URL — never a public URL | Own path only | Own path only | Full (path-agnostic, needed to fetch any user's resume for parsing) | Storage RLS policy checking the first path segment equals `auth.uid()` | No | User A cannot generate a signed URL for, read, or delete an object under user B's path prefix | Very High |
| `raw_capture_debug` (optional, disabled by default) | Short-retention raw external content, only enabled during active adapter debugging (see [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy)) | No browser access at all | No | No | Full (only role permitted to read/write while the debug path is enabled) | No | A test asserting the anon and authenticated roles have zero grants on this bucket when it exists | Medium (third-party raw content; not personal data by design, but unsanitized and disposable) |

## Cross-references

- [DATA_MODEL.md](DATA_MODEL.md) — the schema this matrix authorizes.
- [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) — the broader threat model this matrix is one
  concrete control within.
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md#2-rls-testing) — how each isolation test in this matrix
  is actually implemented and run.
- [AGENTS.md](../AGENTS.md) — the standing rule that authorization is enforced server-side (RLS),
  never by frontend logic alone.
