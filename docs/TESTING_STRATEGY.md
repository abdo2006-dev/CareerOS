# Testing Strategy

Status: **proposal**. The emphasis here is deliberately weighted toward the parts of this system
that are hardest to eyeball-verify and most damaging to get wrong silently: scoring correctness,
RLS isolation, and version-history integrity.

## 1. Priorities, in order

1. **RLS policy correctness** — a bug here leaks one user's resume/profile/application data to
   another (future) user. This is the highest-severity failure mode in the whole system.
2. **Scoring determinism and explainability** — a scoring bug produces a wrong recommendation
   category or an evidence trail that doesn't actually match the claimed reasoning, undermining the
   entire explainability requirement.
3. **Adapter correctness and idempotency** — a broken adapter either silently stops finding new
   postings (worse: no error, just quiet staleness) or creates duplicate/corrupted opportunity
   records.
4. **Version-history integrity** — a bug that overwrites instead of versioning defeats the core
   "preserve postings before they disappear" value proposition.
5. **Cross-source deduplication correctness** — an incorrect auto-merge silently combines two
   different postings' histories and scores (hard to notice, harder to undo); a forgotten
   `merged_duplicate` filter shows or counts a "ghost" duplicate. See §5.
6. Everything else (UI correctness, formatting, etc.) — normal frontend testing practices apply,
   not detailed further here.

## 2. RLS testing

- Automated tests (using the Supabase local dev stack / `supabase test db`, or direct SQL test
  scripts) that, for every user-owned table, assert: a row created by user A is not selectable,
  updatable, or deletable by an authenticated user B, and is fully accessible to user A.
- The full list of tables/buckets requiring this test, with the specific predicate each test
  should assert, is enumerated in [RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md) — that document is
  the authoritative checklist; this section states the testing *method*, not the per-table list.
- These tests are written once per table and re-run whenever a migration touches that table's
  policies — a migration that changes RLS policies without an accompanying test update should be
  treated as incomplete.

## 3. Scoring pipeline testing

- **Unit tests per sub-score function** (skill alignment, project evidence, eligibility rules,
  etc.) against small, hand-constructed profile/posting fixtures with known expected output —
  this is where explainability is actually verified: assert not just the score number but that the
  `evidence_jsonb` correctly names the fields that produced it.
- **Golden-fixture regression tests**: a small set of realistic (anonymized/synthetic) postings and
  profiles with an expected `overall_category`, re-run on every change to scoring logic to catch
  unintended shifts.
- **Eligibility-rule tests are exhaustive by design** — because these are binary gates with
  outsized consequences (an eligible candidate wrongly marked ineligible is filtered out of view),
  each rule gets explicit positive and negative test cases.

## 4. Adapter and scheduled-job testing

- Each adapter is tested against **recorded fixture responses** (a saved real response, or a
  realistic synthetic one, checked into the test suite — see §6 for what those fixtures may and
  may not contain) rather than live network calls in CI — live sources are for manual verification
  and scheduled production runs, not test-suite dependencies.
- Idempotency test: running the same fixture twice produces no duplicate `source_listings` or
  `opportunities` rows and no spurious new `opportunity_versions` row when content is unchanged.
- Change-detection test: a fixture with modified content produces exactly one new version, with the
  diff attributable to the changed fields, across every versioned field (not just description
  text) — see [DATA_MODEL.md](DATA_MODEL.md#opportunity_versions--complete-field-list).
- Removal-detection test: a previously-active source listing absent from a new fetch is marked
  `removed`, not deleted, and the canonical opportunity is only marked `removed` once every
  linked listing is removed (see [USER_WORKFLOWS.md](USER_WORKFLOWS.md#workflow-7--preventing-loss-on-deadline-sensitive-postings)).
- **Atomic-claim test**: two overlapping simulated job runs racing to claim the same `pending`
  resume (or other claimable work item) must result in exactly one claiming it — asserted by
  running both claim queries concurrently against a test database and checking only one `UPDATE`
  affected the row.
- **Lease-timeout recovery test**: a work item left in `processing` with a `claimed_at` older than
  the lease timeout must be reclaimable by a subsequent run; a `processing` item within the lease
  window must not be reclaimed.
- Score-immutability test: recomputing a score for an opportunity version that already has a score
  row must insert a new row, never update the existing one — asserted directly against the
  database, not just the application code path (see [ADR-006](adr/ADR-006-posting-version-history.md)).

## 5. Cross-source identity and deduplication testing

- **Strong-match auto-link fixture test**: two fixtures sharing an exact deterministic identifier
  (matching application URL, or a shared upstream requisition ID scoped to the same employer) must
  resolve to one canonical `opportunities` row with two `source_listings` pointing at it.
- **Weak-match flag-not-merge fixture test**: two fixtures with only fuzzy similarity (same
  organization, similar title, no exact shared identifier) must produce two independent
  `opportunities` rows plus one `potential_duplicate_links` row with `status = pending_review` —
  never an automatic merge.
- **No-match fixture test**: an unrelated new listing produces a new opportunity and no duplicate
  flag.
- **Merge-confirmation test**: confirming a `pending_review` pair sets the loser's `status =
  merged_duplicate` and `merged_into_opportunity_id`, re-points its `source_listings`, and leaves
  its historical `opportunity_versions` rows untouched (their `opportunity_id` is not rewritten).
- **Market-aggregation double-count-exclusion test**: a confirmed duplicate pair must contribute
  exactly one, not two, to `market_skill_mentions.opportunity_count`.
- **Query-surface test**: every query used to list or score opportunities for the frontend is
  asserted to either filter out `status = merged_duplicate` rows or follow
  `merged_into_opportunity_id` — this is a deliberate regression guard against the specific
  "ghost duplicate" failure mode called out in
  [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md).

## 6. Sanitization and security-relevant tests

- HTML sanitization: fixtures containing script tags, event handlers, and other active content
  must come out sanitized; this is a regression-tested function, not a one-time manual check.
- SSRF guard tests for the user-submitted-link adapter: private/internal IP ranges and non-http(s)
  schemes must be rejected, including via a redirect to a disallowed target.
- File-upload validation tests: non-PDF/DOCX content, oversized files, and malformed files must
  fail safely (status `failed`, no crash, no partial write).
- Fixtures used across every test in this document are **sanitized or synthetic recorded
  responses only** — a real raw external response is never checked into the test suite verbatim;
  it is either hand-sanitized first or replaced with a realistic synthetic equivalent. This keeps
  the test suite consistent with the raw-content retention policy in
  [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy) and avoids incidentally
  storing a third party's original content indefinitely in version control.

## 7. Frontend testing

Standard practice, not elaborated at length here: component tests for the fit-explanation view
(does it render the evidence it's given, not just the score), and integration tests for the
core workflows in [USER_WORKFLOWS.md](USER_WORKFLOWS.md) using a local Supabase instance
seeded with fixture data.

## 8. What "done" means for a test claim

Per [AGENTS.md](../AGENTS.md): a coding agent must actually run the test suite and report the real
output. "Tests should pass" or an unverified claim of passing is not an acceptable substitute for
running them.

## 9. Explicitly out of scope for now

Load/performance testing (no meaningful load at one-user scale), cross-browser matrix testing
beyond modern evergreen browsers, and automated accessibility auditing beyond basic semantic HTML
practices — revisit if/when the user base or ambition grows (see
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)).
