# ADR-010: Opportunity Identity and Cross-Source Deduplication

**Status**: Proposed

## Context

The original data model tied one `opportunities` row directly to one `source_id` +
`external_id`. That works as long as every real-world posting is discovered through exactly one
source. It breaks as soon as the same posting is discoverable through more than one source — for
example, a company posts a working-student role on its own career page, and the same role is also
mirrored on a Greenhouse job board, and possibly also appears on a public job-aggregator feed.
Under the original model, ingesting from all three sources creates **three separate
`opportunities` rows for one real job**, which:

- shows the user the same opportunity multiple times as if they were different,
- fragments any saved/applied state (the user could save "the Greenhouse version" and separately
  see "the career-page version" as unsaved),
- and double- or triple-counts that single posting in market-skill aggregation, silently
  distorting the market-intelligence numbers this product is supposed to provide honestly.

## Decision

Introduce a three-layer identity model (full field definitions in
[DATA_MODEL.md](../DATA_MODEL.md#opportunity-identity-domain-sharedglobal-service-role-write)):

1. **`source_listings`** — one row per `(source_id, external_id)`. This is what an adapter
   actually observed: its own URL, its own first/last-seen timestamps, its own status. It never
   holds descriptive content.
2. **`opportunities`** — the canonical, real-world opportunity. Holds only identity, lifecycle
   status, and a pointer to the current version. Zero or more `source_listings` point at one
   `opportunities` row via `source_listings.opportunity_id`.
3. **`opportunity_versions`** — immutable content snapshots, each tied to both the canonical
   opportunity and the specific source listing whose capture produced it (see
   [ADR-006](ADR-006-posting-version-history.md)).

**Linking rule, applied at ingestion time for every new, previously-unlinked source listing:**

- **Strong, deterministic match** (an exact shared identifier the sources themselves expose — e.g.
  an ATS-assigned requisition ID also visible in a company's own posting text, or byte-identical
  normalized application URLs) → **auto-link**: the new listing's `opportunity_id` is set directly
  to the matching existing opportunity, and a new `opportunity_version` tied to this listing is
  inserted under that same canonical opportunity. No human step required — the evidence is
  unambiguous.
- **Weak or uncertain match** (same organization plus high title similarity, overlapping
  description content, or any signal derived from fuzzy/similarity matching rather than an exact
  shared identifier) → **never auto-merge**. Create a new, independent `opportunities` row for the
  listing (so nothing is hidden or lost), and additionally insert a `potential_duplicate_links`
  row (`status = pending_review`) recording the two candidate opportunity IDs and the specific
  evidence (`match_basis_jsonb`) that triggered the flag.
- **No match signal at all** → create a new opportunity, no flag.

**Human review, not automatic resolution, closes the loop**: a user-facing review queue (see
[USER_WORKFLOWS.md](../USER_WORKFLOWS.md#workflow-8--reviewing-a-potential-duplicate)) lets the
user confirm or reject each pending pair. Confirming sets the loser's `status =
merged_duplicate` and its `merged_into_opportunity_id`, and re-links its `source_listings` to the
surviving canonical opportunity; existing `opportunity_versions` rows are **not rewritten** — they
keep their original `opportunity_id` history, since they are immutable by design — reads that need
the canonical view simply follow `merged_into_opportunity_id`.

**Choosing `current_version_id` when multiple listings feed one opportunity**: the most recently
`captured_at` version across all linked, non-removed source listings is treated as current. This
is a simple, explainable rule rather than an attempt to intelligently reconcile conflicting
content from different sources into one synthesized record — reconciliation-by-merging-fields is
explicitly rejected (see alternatives below) as too error-prone for a small team to get right.

**Market-intelligence aggregation must count distinct, non-merged `opportunity_id`s** — see
[DATA_FLOW.md](../DATA_FLOW.md#4-market-intelligence-aggregation). Pending (`pending_review`)
duplicates are counted as distinct until confirmed, which is an accepted, documented
over-counting risk rather than a hidden one.

## Alternatives considered

- **No deduplication at all (status quo)**: rejected — directly causes the duplicate-display and
  double-counting problems this ADR exists to fix.
- **Fuzzy/similarity-based automatic merging** (e.g., merge whenever a similarity score exceeds a
  threshold): rejected as the default behavior. A false-positive merge is worse than a
  false-negative non-merge here: it silently combines two different postings' histories and
  scores, which is very hard for a user to notice or undo later, whereas an unmerged duplicate is
  merely a visible annoyance the user can manually resolve. Automatic merging is not ruled out
  forever, but reintroducing it would need its own ADR plus a track record of the manual-review
  queue showing which signals reliably predict a correct merge.
- **Merge content fields from multiple sources into one synthesized record** (e.g., take the
  description from whichever source has the longest text, take the deadline from whichever source
  is most recent): rejected — this reintroduces exactly the "silent mutation of historically
  meaningful content" problem [ADR-006](ADR-006-posting-version-history.md) exists to prevent, and
  makes it unclear to a future reader which source a given displayed fact actually came from. The
  "most recent version wins for display, but every version keeps its own listing provenance"
  rule is simpler and fully traceable.
- **Treat every source as fully independent, never dedupe** (accept the duplication as a known
  limitation): considered as a fallback if dedup logic proves too unreliable in practice, but
  rejected as the starting design because market-intelligence accuracy is a stated product goal,
  not a nice-to-have.

## Consequences

- Ingestion logic gains a real decision point (auto-link / flag / new) that must be tested
  explicitly — see the test list below.
- The review queue is new, small, user-facing surface area (Workflow 8); it must exist before
  cross-source ingestion (more than one adapter that could plausibly cover the same employer) is
  turned on, not after.
- `opportunities.status = merged_duplicate` and `merged_into_opportunity_id` must be respected by
  every query that displays or scores opportunities — a query that forgets to filter out
  merged-duplicate rows (or forgets to follow the merge pointer) will show or count a "ghost"
  duplicate. This is the primary new failure mode this design introduces, and it is called out
  explicitly in [OBSERVABILITY.md](../OBSERVABILITY.md) and [TESTING_STRATEGY.md](../TESTING_STRATEGY.md).
- Saved opportunities and applications referencing a since-merged opportunity keep working: they
  still point at their original `opportunity_id` and pinned `opportunity_version_id`; the UI
  follows `merged_into_opportunity_id` to show current status/current version alongside the
  user's original saved content, rather than breaking the reference.

## Failure modes

- **A strong-match rule turns out not to be as unique as assumed** (e.g., two different companies
  reuse the same requisition-ID format from a shared ATS vendor and happen to collide): would
  cause an incorrect auto-merge. Mitigation: strong-match rules are scoped per-source-pair
  (comparing IDs only makes sense between sources known to share an upstream ATS instance for the
  *same* employer, not globally across all sources) and this scoping is recorded alongside the
  rule in the adapter/dedup code, not left implicit.
- **The review queue is ignored** (a single user, busy, lets `pending_review` rows accumulate):
  market-intelligence over-counting grows unbounded but stays bounded to genuinely-ambiguous
  cases, since strong matches never enter the queue at all; this is a usability issue, not a
  silent-correctness issue, and is visible via [OBSERVABILITY.md](../OBSERVABILITY.md)'s
  pending-review count.
- **A query forgets to filter `merged_duplicate` rows**: caught by the dedicated test in
  [TESTING_STRATEGY.md](../TESTING_STRATEGY.md#5-cross-source-identity-and-deduplication-testing).

## Tests required

See [TESTING_STRATEGY.md](../TESTING_STRATEGY.md#5-cross-source-identity-and-deduplication-testing)
for the full list; summarized here: strong-match auto-link fixture test, weak-match
flag-not-merge fixture test, no-match new-opportunity fixture test, merge-confirmation
re-pointing test, market-aggregation double-count-exclusion test, and a query-surface test
asserting no opportunity-listing or scoring query returns `merged_duplicate` rows without
following the merge pointer.
