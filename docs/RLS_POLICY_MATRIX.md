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
- **Grants are never assumed from Supabase's defaults.** Empirically (confirmed against the
  running local stack while implementing Phase 0), Supabase's per-schema default privileges grant
  `authenticated` and `service_role` every standard table privilege (SELECT/INSERT/UPDATE/DELETE/
  TRUNCATE/REFERENCES/TRIGGER) on a newly created `public` table, and historically could do the
  same for `anon`. Every migration therefore `REVOKE ALL` on all three roles first, then grants
  back exactly the intended, minimal set — so the privilege set in effect is always what's
  explicitly written in the migration, never whatever a platform default happened to leave in
  place. Grants and RLS remain two independent controls: a grant decides whether a role can reach
  a table at all; RLS decides which rows it may see once there. Neither one substitutes for the
  other, and `service_role`'s RLS bypass does not remove the need for its explicit grant.
- **Anonymous access failure mode is "insufficient privilege," not "empty result."** Because
  `anon` is granted nothing at all on `profiles`/`education_entries`, an anonymous request fails at
  the grant level (Postgres error `42501`, surfaced by PostgREST as HTTP 403) before RLS is even
  evaluated. This is a meaningfully different, and stronger, guarantee than "RLS filtered the rows
  down to zero" (which is what happens to an *authenticated* user querying another user's data) —
  tests must assert the correct one for each role, and confusing them is a real category error, not
  a nitpick.

## Profile domain (user-owned)

**Status**: `profiles`, `education_entries`, `work_experience`,
`profile_section_revisions`, and `profile_section_reviews` are implemented and pgTAP-tested.
All other rows in this profile-domain section remain proposed Phase 1A policy, not schema. Phase
1B resume/suggestion tables are intentionally not designed here.

Every table's owner column is literally named `user_id` (see [AGENTS.md](../AGENTS.md)) — child
tables reference the owning user via a direct `user_id` foreign key to `profiles.user_id`, never
via a renamed column like `profile_id`. The implemented predicate form is
`(select auth.uid()) = user_id` (wrapping `auth.uid()` in a `select` lets Postgres evaluate it
once per statement rather than once per row — the currently-recommended, non-deprecated pattern).

| Table(s) | Category / owner | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation and ownership-bypass test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `profiles` | User-owned root row; direct `user_id` references Auth user | Own only | Own only | Own only | **No direct browser DELETE** | Trusted service/administrative code may have broader maintenance, export, repair, and coordinated-account-deletion access. Root-profile deletion is permitted only in an explicit trusted workflow that coordinates the Auth user, database records, Storage objects, confirmation, and any export requirement — never as a normal browser or routine service-role path. | `(select auth.uid()) = user_id` for SELECT/INSERT/UPDATE; no browser DELETE grant/policy | No | Owner SELECT/INSERT/UPDATE; DELETE fails even for owner; cross-user and forged-owner denial; service deletion is exercised only through the trusted workflow | High |
| `education_entries`, `work_experience` | **Implemented** user-owned history/evidence; direct `user_id` references `profiles(user_id)` | Own only | Own only | Own only, content columns only | Own only | Explicit full maintenance access | `(select auth.uid()) = user_id` for `USING` and `WITH CHECK` | No | Owner CRUD; cross-user SELECT/UPDATE/DELETE denial; forged `user_id` insert; ownership-rewrite, provenance, and timestamp-write denial | High |
| `projects`, `profile_links`, `user_skills`, `user_languages`, `preferences`, `target_companies` | Proposed user-owned; direct `user_id` references `profiles(user_id)` | Own only | Own only | Own only | Own only | Full for maintenance/export/account deletion | `(select auth.uid()) = user_id` for `USING` and `WITH CHECK` | No | Owner CRUD; cross-user SELECT/UPDATE/DELETE denial; forged `user_id` insert; ownership-rewrite denial | High (`profile_links`/targets Medium) |
| `profile_section_reviews` | User-owned deliberate review; composite key `(user_id, section_key)` | Own only | **No direct browser write**; restricted RPC only | **No direct browser write**; restricted RPC only | **No direct browser write** | Full | Direct owner SELECT; `review_profile_section` derives `auth.uid()` and locks the current revision | No | User cannot forge an owner/key/revision; RPC writes only the locked current revision | High |
| `profile_section_revisions` | User-owned, database-maintained freshness metadata | Own only | No direct browser write | No direct browser write | No direct browser write | Trusted migration/mutation mechanism only | Direct owner SELECT; no browser mutation grant | No | User can read only own revision; browser cannot forge/increment/rewrite revision; relevant insert/update/delete increments it atomically | Medium |
| `preference_locations`, `user_target_engineering_areas`, `user_target_role_types` | User-owned relation; direct `user_id` | Own only | Own only | Own only where applicable | Own only | Full | Direct owner predicate plus composite parent `(user_id, parent_id)` validation | No | Owner CRUD; all cross-user denials; forged owner; cannot attach a valid user A row to B's preferences/profile | Medium |
| `project_skills` | User-owned relation; direct `user_id` | Own only | Own only | N/A or own only | Own only | Full | Direct owner predicate plus `(user_id, project_id)` composite FK | No | User A cannot attach B's project to A's skill or vice versa, even when UUID is known; owner CRUD | High |
| `skill_evidence` | User-owned typed evidence; direct `user_id` | Own only | Own only | Own only | Own only | Full | Direct owner predicate, same-user composite references, and exactly-one-source check (`project`/`experience`/`education`/`link`/bounded note) | No | User A cannot create evidence on B's claim/project/experience/education/link; zero or multiple sources and oversized notes fail; cannot rewrite owner/target; owner CRUD | High |
| `work_eligibility` | **Highly sensitive user-owned**; direct `user_id` | Own only | Own only | Own only | Own only | Full only for explicit maintenance/export/deletion | Direct owner predicate | No | Owner CRUD; cross-user and forged-owner denials; anon 403; API-path JWT test | Very High |
| `skills_catalog`, `skill_aliases`, `engineering_areas`, `role_types` | Shared authenticated-readable reference data | All authenticated users | No | No | No | Full; service maintains canonical values | No owner predicate; grant SELECT only to authenticated | No | Authenticated read succeeds; authenticated INSERT/UPDATE/DELETE fails at grant; service maintenance path succeeds | Low |

Private `user_skills.custom_label` values are never copied into shared catalogs or market
aggregation automatically. Every future migration must include exact grants, RLS policies, and the
listed pgTAP plus real Auth/JWT/PostgREST checks; no frontend permission check substitutes for them.

## Resume domain (user-owned)

**Status: Phase 1B deferred.** This retained future-policy sketch is not authorization for a
Phase 1A migration; resume/suggestion design must be revisited with field-level provenance.

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `resumes` | One row per uploaded resume, owned by the uploading user | Own rows only | Own rows only (creates the `pending` record at upload time) | **No** — `status`, `claimed_at`, `claimed_by_run_id` are job-owned fields; the browser never updates this row directly (a corrected resume is a new upload, not an edit) | Own rows only | Full (claim, process, mark `completed`/`failed`) | `user_id = auth.uid()` | No | User A cannot SELECT or DELETE user B's resume record; user A cannot UPDATE any resume row (including their own) via the browser role at all | Very High (references the actual resume file) |
| `resume_extractions` | Raw parser output for one resume, owned transitively via `resume_id → resumes.user_id` | Own rows only (to review the draft) | No (written only by the parsing job) | No | No | Full | `resume_id IN (SELECT id FROM resumes WHERE user_id = auth.uid())` | No | User A cannot SELECT user B's extraction; user A cannot INSERT/UPDATE/DELETE any extraction row, including their own, via the browser role | Very High |

## Opportunity identity and content domain (shared/global)

**Status (Phase 2A.1)**: implemented as described below, with all writes going through three
narrow `SECURITY DEFINER` functions (`begin_ingestion_run`, `apply_source_listing`,
`finalize_ingestion_run`) instead of direct table grants — none of the three are granted `EXECUTE`
to `anon` or `authenticated`, only to `service_role`. `potential_duplicate_links` and the
merge-confirmation function are not implemented (see the Phase 2A.1 scope note in
[DATA_MODEL.md](DATA_MODEL.md#opportunity-identity-domain-sharedglobal-service-role-write)); revisit
when a second adapter is added.

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `sources` | Shared adapter/source registry | All authenticated users | No | No | No | Full | None (shared read, service-role write) | No | Any authenticated user can read; no authenticated user can write | Low |
| `source_listings` | Shared — one row per (source, external_id) observation | All authenticated users | No | No | No | Full (in practice, only ever written via `apply_source_listing`/`finalize_ingestion_run`) | None | No | Any authenticated user can read; no authenticated user can write | Low |
| `opportunities` | Shared — canonical, real-world opportunity identity/status | All authenticated users | No | **No direct grant of any kind** — every write goes through `apply_source_listing`/`finalize_ingestion_run` | No | Full (same caveat as above) | None (shared read; writes via the trusted RPCs only) | No | Any authenticated user can read; no authenticated user can perform a raw UPDATE/INSERT/DELETE | Low (identity/status metadata only — no descriptive content lives here) |
| `opportunity_versions` | Shared — immutable content snapshots | All authenticated users | Insert-only, and only reachable via `apply_source_listing` (no direct `authenticated` grant) | No (never — immutability is enforced at the grant level, not just by convention; see [ADR-006](adr/ADR-006-posting-version-history.md)) | No | Insert-only (no service-role UPDATE/DELETE either, by policy, to make the immutability guarantee structural rather than merely a code convention) | None (shared read; append-only writes via `apply_source_listing`) | No | Any authenticated user can read; no role — including service-role — can UPDATE or DELETE an existing row; new content only ever arrives as a new row | Low–Medium (contains sanitized third-party posting text) |
| `ingestion_runs` | Shared — operational log | All authenticated users | No | No | No | Insert/update via `begin_ingestion_run`/`finalize_ingestion_run` only | None | No | Any authenticated user can read; no authenticated user can write; `error_summary` content is checked (by convention + a test) to never contain resume text or profile field values | Low (must never contain personal data — see [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)) |
| `opportunity_search` (view) | Shared read model: current-version projection joined to source provenance | All authenticated users | N/A (view) | N/A | N/A | Full (direct table access) | None (`security_invoker`; relies on the base tables' own read-only grants) | No | Any authenticated user can read; anon is denied at the grant level | Low |
| `potential_duplicate_links` | **Not yet implemented** (Phase 2A.1 scope note above) — proposed shape retained for when a second adapter is added: shared, pending/resolved duplicate-review flags | All authenticated users | No (created only by the ingestion/dedup step) | **No direct grant.** Confirm/reject would go through `confirm_potential_duplicate(...)` / `reject_potential_duplicate(...)` `SECURITY DEFINER` functions, which validate the row exists, is `pending_review`, and belongs to a legitimate pair before changing its status | No | Full | None (shared read; controlled write via function) | No | Any authenticated user can read the queue; no authenticated user can set `status` via a raw UPDATE — only via the review function, and only to `confirmed_duplicate`/`rejected` | Low |
| `career_market_scores` | **Not yet implemented** (Phase 2A.2) — Shared, Ranking 1, not user-specific | All authenticated users | No | No | No | Full | None | No | Any authenticated user can read; no authenticated user can write | Low |
| `market_skill_mentions` | **Not yet implemented** (Phase 6) — Shared, aggregate market-intelligence snapshot | All authenticated users | No | No | No | Full | None | No | Any authenticated user can read; no authenticated user can write | Low (aggregate/anonymized by construction) |

## User activity domain (user-owned)

| Table | Owner / data type | Browser SELECT | Browser INSERT | Browser UPDATE | Browser DELETE | Service-role | Expected RLS predicate | Anon access | Required isolation test | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| `user_opportunity_state` | Save/hide state for a shared opportunity, one row per `(user_id, opportunity_id)` — **implemented name for what an earlier draft of this document called `saved_opportunities`**, per the naming ADR-018 itself uses | Own rows only | Own rows only | Own rows only, excluding `user_id`/`opportunity_id` | Own rows only | Full (admin/export/account-deletion) | `(select auth.uid()) = user_id` | No | User A cannot SELECT/INSERT/UPDATE/DELETE any row owned by user B; full CRUD on own rows; a trigger rejects a `saved_opportunity_version_id` that doesn't belong to the given `opportunity_id` | High (reveals job-search targets and interests) |
| `applications` | One row per application, owned directly via `user_id` | Own rows only | Own rows only, excluding `private_opportunity_snapshot`/`status_updated_at`/timestamps (server-derived) | Own rows only, excluding `opportunity_version_id`, `private_opportunity_id`, `private_opportunity_snapshot`, `user_id`, and timestamps | Own rows only | Full (admin/export/account-deletion) | `(select auth.uid()) = user_id` | No | User A cannot SELECT/INSERT/UPDATE/DELETE any row owned by user B; the pinned shared version and the manual snapshot are immutable after creation (grant-level, plus a trigger for `private_opportunity_id` re-pointing); exactly-one-source and valid-status are enforced by both a check constraint and a trigger | High (reveals job-search targets, strategy, and status — treat as sensitive career-strategy data) |
| `interview_prep_notes` | One row per application; `user_id` is denormalized and always server-derived from the referenced application's owner, never client-supplied | Own rows only | Own rows only (browser has no grant to set `user_id` at all) | Own rows only, excluding `user_id`/`application_id`/timestamps | Own rows only | Full | `(select auth.uid()) = user_id` | No | User A cannot SELECT any row belonging to user B; attaching notes to user B's application fails because RLS hides that application from user A's own ownership-lookup subquery | High (may contain candid personal notes on interview performance/strategy) |
| `private_opportunities` | **Implemented (Phase 2A.1, see [ADR-018](adr/ADR-018-private-manual-opportunities.md))**: manually entered opportunities, owned directly via `user_id`; structurally and permission-wise unrelated to the shared opportunity-identity domain above | Own rows only | Own rows only | Own rows only, content columns only (excludes `source_url`, which is preserved verbatim as provenance) | Own rows only | Full for maintenance/export/account deletion; the browser has **no** grant to write `promoted_to_opportunity_id` under any circumstance — that column is trusted-write only, reserved for a future, not-yet-built promotion mechanism | `(select auth.uid()) = user_id` for `USING` and `WITH CHECK`, following the `work_experience` template exactly | No | Owner CRUD; cross-user SELECT/UPDATE/DELETE denial; forged `user_id` insert denial; browser cannot write `promoted_to_opportunity_id`, `source_url` (on update), `created_at`, or `updated_at`; deleting a private opportunity referenced by an application sets `applications.private_opportunity_id` to null (`on delete set null`) while the application's own snapshot survives | High (reveals job-search targets and interests) |
| `career_fit_scores`, `development_scores` | **Not yet implemented** (Phase 3) — user-specific scores against a shared opportunity version | Own rows only | No (written only by the scoring job) | No | No | Full | `(select auth.uid()) = user_id` | No | User A cannot SELECT any score row belonging to user B; user A cannot write any score row via the browser role, including their own | High (`eligibility_status` in particular can reveal immigration/visa-driven exclusion — treat as sensitive personal-attribute data) |

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
