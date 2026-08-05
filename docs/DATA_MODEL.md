# Data Model

Status: **proposal**. This is a logical model to guide implementation, not final SQL migrations —
column types and constraints will be refined when migrations are actually written. Every
user-owned table carries a direct `user_id` ownership column. `profiles.user_id` directly
references `auth.users(id)`; child user-owned tables generally reference `profiles(user_id)`
through their direct `user_id`. RLS compares that direct ownership column with
`(select auth.uid())`; association tables additionally use ownership-safe composite foreign keys
where needed. This is what makes the schema multi-tenant-ready from day one per
[ADR-008](adr/ADR-008-private-first-multi-user-later.md). Shared/global tables (opportunities,
source listings, sources, market intelligence) are readable by any authenticated user and writable
only by the service role used by ingestion jobs. The exact permission for every table and storage
bucket — including the anonymous-access answer — is enumerated exhaustively in
[RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md); this document should not be treated as the
authoritative permission reference on its own.

## Revision note (Phase 1A architecture pass)

This revision corrects two gaps identified in review:

1. `opportunity_versions` previously omitted several mutable fields (location, remote status,
   deadline, source URL, category/subtype, career- and development-specific structured fields,
   sanitized display content, source metadata, parser/normalizer version), leaving them only on
   the stable `opportunities` row — which meant they could change silently without becoming part
   of history. They are now part of the version, not the stable row. See
   [ADR-006](adr/ADR-006-posting-version-history.md).
2. The model tied one opportunity directly to one source, which cannot represent the same
   real-world posting appearing through multiple sources without creating duplicates and
   double-counting market statistics. A `source_listings` layer and a conservative
   deduplication design now sit between raw source data and the canonical `opportunities` table.
   See [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md).
3. Phase 1 is split into **Phase 1A manual structured profile** and **Phase 1B resume intake and
   extraction drafts** ([ADR-011](adr/ADR-011-manual-profile-before-resume-extraction.md)). The
   profile model below is a Phase 1A proposal only: it does not create migrations or resume/
   suggestion structures. `profiles.profile_complete` has no authoritative role; completeness is
   derived from [PROFILE_COMPLETENESS_SPEC.md](PROFILE_COMPLETENESS_SPEC.md).

## Revision note (Phase 2A.0 architecture pass)

Manually entered opportunities are **not** part of the shared opportunity-identity domain below.
[ADR-018](adr/ADR-018-private-manual-opportunities.md) adds `private_opportunities` (see the User
activity domain table) as a structurally separate, user-owned table — private by default, ordinary
mutable CRUD rather than versioned, and outside [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md)'s
deduplication scope. This is a documentation-and-decision update only; no migration exists yet
(that is Phase 2A.1). [ADR-016](adr/ADR-016-typescript-ingestion-runtime.md) and
[ADR-017](adr/ADR-017-local-first-ingestion-execution.md) additionally settle the ingestion runtime
language and execution model referenced throughout [ARCHITECTURE.md](ARCHITECTURE.md) and
[DATA_FLOW.md](DATA_FLOW.md); neither changes this document's schema.

## Entity-relationship overview

```mermaid
erDiagram
    USERS ||--o| PROFILES : has
    PROFILES ||--o{ EDUCATION_ENTRIES : has
    PROFILES ||--o{ PROFILE_SECTION_REVIEWS : records
    PROFILES ||--o{ PROFILE_SECTION_REVISIONS : tracks
    PROFILES ||--o{ WORK_EXPERIENCE : has
    PROFILES ||--o{ PROJECTS : has
    PROFILES ||--o{ PROFILE_LINKS : has
    PROFILES ||--o{ USER_SKILLS : has
    SKILLS_CATALOG ||--o{ SKILL_ALIASES : has
    SKILLS_CATALOG ||--o{ USER_SKILLS : claimed_as
    USER_SKILLS ||--o{ SKILL_EVIDENCE : supported_by
    PROJECTS ||--o{ PROJECT_SKILLS : uses
    PROFILES ||--o{ USER_LANGUAGES : has
    PROFILES ||--o| PREFERENCES : has
    PREFERENCES ||--o{ PREFERENCE_LOCATIONS : has
    PROFILES ||--o| WORK_ELIGIBILITY : has
    USERS ||--o{ RESUMES : uploads
    RESUMES ||--o{ RESUME_EXTRACTIONS : produces

    SOURCES ||--o{ INGESTION_RUNS : produces
    SOURCES ||--o{ SOURCE_LISTINGS : yields
    SOURCE_LISTINGS ||--o{ OPPORTUNITY_VERSIONS : captures
    SOURCE_LISTINGS }o--|| OPPORTUNITIES : maps_to
    OPPORTUNITIES ||--o{ OPPORTUNITY_VERSIONS : has
    OPPORTUNITIES ||--o{ CAREER_MARKET_SCORES : scored_by
    OPPORTUNITIES ||--o{ CAREER_FIT_SCORES : scored_by
    OPPORTUNITIES ||--o{ DEVELOPMENT_SCORES : scored_by
    OPPORTUNITIES ||--o{ POTENTIAL_DUPLICATE_LINKS : flagged_in
    OPPORTUNITIES ||--o| OPPORTUNITIES : merged_into

    USERS ||--o{ SAVED_OPPORTUNITIES : saves
    OPPORTUNITY_VERSIONS ||--o{ SAVED_OPPORTUNITIES : snapshot_of
    USERS ||--o{ APPLICATIONS : tracks
    SAVED_OPPORTUNITIES ||--o| APPLICATIONS : becomes

    USERS ||--o{ PRIVATE_OPPORTUNITIES : enters
    PRIVATE_OPPORTUNITIES ||--o| OPPORTUNITIES : promoted_to
    APPLICATIONS ||--o{ TASKS : generates
    APPLICATIONS ||--o{ INTERVIEW_PREP_NOTES : has

    OPPORTUNITIES ||--o{ MARKET_SKILL_MENTIONS : contributes_to
```

## Profile domain (Phase 1A proposal; user-owned unless marked shared)

**Implementation status**: the implemented Phase 1A slices include refined `profiles`, refined
`education_entries`, `work_experience`, and section freshness/review rows for `basic_profile`,
`education`, and `experience`. The remaining profile-domain tables below remain logical targets,
not implemented SQL. Phase 1B resume and suggestion records are expressly excluded.

### Implemented profile-core migration note

The Phase 0 `profiles.degree_program`, `profiles.degree_year`, and
`profiles.profile_complete` columns are retained temporarily as deprecated compatibility fields.
They are not authoritative and the browser does not write them. A forward migration copies a
legacy degree year only when its profile has exactly one existing education row and that target
field is null; it never chooses a primary row, infers a status, creates an institution, or maps
the ambiguous legacy degree-program text into `degree` or `field`. Existing profiles begin with
`basic_profile` and `education` revisions at zero and no reviews. New profile creation initializes
those rows transactionally.

`last_confirmed_at` is nullable for migrated profile and education rows: `NULL` means the legacy
row has not yet been manually confirmed in the current profile model. New manual creation defaults
to the current timestamp, and later manual content edits refresh it.

**Ownership rule (binding, see [AGENTS.md](../AGENTS.md))**: every user-owned table has direct
`user_id`, including association tables. The root `profiles.user_id` references `auth.users(id)`;
child user-owned rows generally reference `profiles(user_id)` through that same direct `user_id`.
User-owned child references use ownership-safe composite foreign keys — e.g. `(user_id,
project_id)` references a unique `(user_id, id)` on `projects` — or an equivalent constraint. A
UUID alone never authorizes attaching another user's row. Each manual row may include
`created_via = manual`, `created_at`, `updated_at`, and meaningful `last_confirmed_at`; this is
row context, not a Phase 1B provenance solution.

| Entity | Purpose / ownership / key | Major foreign keys and constraints | Deletion / RLS / sensitivity / browser access / later consumer |
|---|---|---|---|
| `profiles` | One profile identity per user; user-owned; `user_id` PK. | FK `auth.users(id)`; holds only profile-level facts such as preferred name and headline; no authoritative degree program, degree year, or graduation timing; no `profile_complete`. | Cascades from Auth-user deletion; own-row RLS; High; browser SELECT/INSERT/UPDATE only — never direct DELETE; Phase 1A overview, later matching/scoring. |
| `education_entries` | Education history and authoritative education facts; user-owned; `id` PK, direct `user_id`. | `(user_id)` → `profiles`; institution, degree, field, `degree_year`, expected graduation month/year, start date, and `education_status`; date/order checks. `is_primary` is optional, but partial unique `(user_id) WHERE is_primary` permits at most one primary entry. A primary normally must be current; explicit status constraint enforces that relationship. Multiple active entries remain allowed. | Cascade from profile; own-row RLS; High; browser CRUD; completeness, matching, evidence. A later forward migration copies Phase 0 `profiles.degree_program`/`degree_year` into the selected or created primary entry before removing their authoritative role. |
| `profile_section_reviews` | Deliberate review of a UI section, including intentionally empty sections; user-owned; composite PK `(user_id, section_key)`. | `(user_id)` → profiles; controlled keys: `basic_profile`, `education`, `experience`, `projects`, `skills`, `languages`, `preferences`, `work_eligibility`; `reviewed_at`, `reviewed_content_revision`, timestamps. | Cascade from profile; own-row RLS; High; browser CRUD; deterministic review state/completeness. |
| `profile_section_revisions` | Minimal deletion-safe content freshness state; user-owned metadata; composite PK `(user_id, section_key)`. | Same controlled keys; non-negative monotonic `content_revision`, `updated_at`. Created at revision zero for each section; database-maintained mutation path increments it transactionally on relevant row create/update/delete. | Cascade from profile; own-row RLS; Medium; browser SELECT only; supports review freshness without a reset-flag trigger. |
| `work_experience` | Employment, internship, research, volunteering, student-leadership, or other evidence; user-owned; `id` PK, direct `user_id`. | `(user_id)` → `profiles`; `UNIQUE (user_id, id)` reserves an ownership-safe future evidence target. Required kind, organization, role, and start year; optional month precision and bounded plain-text location/description. End periods cannot precede start periods; a current row has no end period. | Cascade from profile; own-row RLS; High; browser CRUD; experience review/completeness and future matching. Deleting a future evidence target must cascade only its evidence rows, not the user’s skill claim. |
| `projects` | User project evidence; user-owned; `id` PK, direct `user_id`. | `(user_id)` → `profiles`; title required; bounded description; optional safe URL. | Cascade from profile; own-row RLS; High; browser CRUD; completeness, evidence, matching. |
| `profile_links` | Links to portfolio/GitHub/public work; user-owned; `id` PK, direct `user_id`. | `(user_id)` → `profiles`; URL scheme/length allowlist; labeled link. | Cascade from profile; own-row RLS; Medium; browser CRUD; evidence and optional enrichment. |
| `skills_catalog` | Small canonical skill names for matching; shared; `id` PK. | Normalized canonical name unique; bounded category and controlled `is_technical` classification; no user data. | Service maintains; authenticated read only; Low; browser SELECT only; matching and market aggregation. |
| `skill_aliases` | Controlled alternate names for a canonical skill; shared; `id` PK. | `skill_id` → catalog; normalized alias unique; aliases never point to a custom label. | Cascade from catalog; authenticated read only, service write; Low; browser SELECT only; normalization/matching. |
| `user_skills` | A user's skill claim, canonical or private custom; user-owned; `id` PK, direct `user_id`. | `(user_id)` → profile; optional `skill_id` → catalog XOR bounded `custom_label`; unique normalized claim per user; scalar `self_assessment` enum is explicitly self-reported. A claim is technical when its canonical catalog entry is controlled as technical, or a private label is explicitly self-classified technical; private labels remain private. | Cascade from profile; own-row RLS; High; browser CRUD; completeness and future matching. |
| `project_skills` | Relational project technologies/skills; user-owned association; composite PK `(user_id, project_id, skill_id)`. | `(user_id, project_id)` → projects; `skill_id` → catalog; no arrays. | Cascade from project/catalog as appropriate; own-row plus composite-parent checks; High; browser CRUD; evidence and matching. |
| `skill_evidence` | Dedicated many-row association: one typed evidence item for a skill claim; user-owned; `id` PK, direct `user_id`. | `(user_id, user_skill_id)` → user skills. Nullable `project_id`, `work_experience_id`, `education_entry_id`, `profile_link_id`, and bounded `manual_note`; a check constraint requires exactly one source. Each relational target has a same-user composite FK. Adding a new evidence category is an intentional schema change for real FK integrity; note content never enters shared aggregation. | Cascade from claim/target; own-row and parent-bypass tests; High; browser CRUD; evidence-first matching. |
| `user_languages` | Language claims; user-owned; `id` PK, direct `user_id`. | `(user_id)` → profile; normalized language unique per user; scalar CEFR enum. | Cascade from profile; own-row RLS; High; browser CRUD; readiness and matching. |
| `preferences` | Optional singleton preference container; user-owned; `user_id` PK. | FK profile; scalar `remote_preference` enum; no location/target arrays. | Zero-or-one until a migration deliberately auto-creates it; cascade from profile; own-row RLS; High; browser CRUD; matching/filtering. |
| `preference_locations` | Preferred locations relation; user-owned; `id` PK, direct `user_id`. | `(user_id)` → preferences; normalized location + country/region; unique per user. | Cascade from preferences; own-row RLS; Medium; browser CRUD; matching/filtering. |
| `engineering_areas` | Controlled engineering-area reference; shared; `id` PK. | Unique normalized name. | Service-maintained; authenticated read only; Low; browser SELECT only; targeting and matching. |
| `role_types` | Controlled role-type reference; shared; `id` PK. | Unique normalized name. | Service-maintained; authenticated read only; Low; browser SELECT only; targeting and matching. |
| `user_target_engineering_areas` | User's selected areas; user-owned association; composite PK `(user_id, engineering_area_id)`. | `(user_id)` → profile; area → catalog. | Cascade from profile/catalog; own-row RLS; Medium; browser CRUD; readiness and matching. |
| `user_target_role_types` | User's selected roles; user-owned association; composite PK `(user_id, role_type_id)`. | `(user_id)` → profile; role → catalog. | Cascade from profile/catalog; own-row RLS; Medium; browser CRUD; readiness and matching. |
| `target_companies` | Optional watchlist; user-owned; `id` PK, direct `user_id`. | `(user_id)` → profile; normalized company name unique per user; bounded note only. | Cascade from profile; own-row RLS; Medium; browser CRUD; optional enrichment, future discovery. |
| `work_eligibility` | Optional singleton minimal self-reported eligibility state; user-owned, highly sensitive; `user_id` PK. | FK profile; enum `eligible`/`eligible_with_conditions`/`requires_sponsorship`/`unknown`; optional non-negative weekly limit; `last_confirmed_at` required after review. | Zero-or-one per profile; cascade from profile; own-row RLS; Very High; browser CRUD; readiness and future eligibility checks. |

Relational structures are required for skills, aliases, project technologies, evidence, targets, and
preferred locations because they support validation, aggregation, future matching, and explainable
links. Arrays would conceal ownership and parent checks. Scalar enums remain appropriate for
remote preference, skill self-assessment, and work-eligibility state.

### Review freshness

A section is deliberately reviewed only when its `profile_section_reviews` row exists. Its review
is current when `reviewed_content_revision` equals the current revision for that section and the
review time is at least as recent as the latest relevant surviving row's `updated_at`. This lets an
empty collection be reviewed. Timestamps alone are not sufficient after deletion: deleting the
newest row could otherwise make an old review appear current. The small per-section revision row
solves that case: every relevant create, update, or delete increments its revision transactionally,
and a review records the revision it observed. This is a narrowly scoped integrity mechanism, not
a fragile trigger that flips a duplicate completeness flag.

## Resume domain

**Status: Phase 1B deferred.** These records are not part of the Phase 1A model and must not be
created until the confirmed manual profile is stable. Their eventual extraction output is a
reviewable suggestion, not a write path to confirmed profile rows.

| Table | Key fields | Notes |
|---|---|---|
| `resumes` | `id`, `user_id`, `storage_path`, `uploaded_at`, `status` (`pending`\|`processing`\|`completed`\|`failed`), `claimed_at`, `claimed_by_run_id`, `is_active_version` | File itself lives in Supabase Storage, private bucket. Its Phase 1B behavior must extend the deferred flow in [DATA_FLOW.md](DATA_FLOW.md#2b-phase-1b-resume-extraction-deferred). |
| `resume_extractions` | `id`, `resume_id`, `extracted_json`, `extracted_at`, `parser_version` | Raw extraction kept separate from confirmed profile fields, so re-parsing or parser upgrades never silently overwrite user corrections |

## Opportunity identity domain (shared/global, service-role write)

This domain is split into three layers on purpose: a **source-specific record** of what one
adapter saw, a **canonical opportunity** representing the real-world posting, and **immutable
versions** carrying the actual historical content. See
[ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md) for the full
reasoning.

**Implementation status and scope note (Phase 2A.1)**: with exactly one adapter (Greenhouse)
enabled, cross-source deduplication — `potential_duplicate_links`, the strong/weak-match linking
rule, `link_confidence`, `opportunities.merged_into_opportunity_id` — is **not implemented**. There
is no second source that could ever produce a match, so that code would be unexercised and
untestable. `source_listings.opportunity_id` is therefore `not null` (one listing maps to exactly
one opportunity today, a simplification of the table below). Revisit when a second adapter is
proposed, per ADR-010's own scope note. All writes to this domain go through three narrow,
trusted-only Postgres functions (`begin_ingestion_run`, `apply_source_listing`,
`finalize_ingestion_run`) rather than direct table grants — see
[RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md).

| Table | Key fields | Notes |
|---|---|---|
| `sources` | `id`, `source_key` (unique, e.g. `greenhouse:helsing`), `adapter_kind` (non-unique, e.g. `greenhouse`), `display_name`, `base_url`, `enabled` | Registry of configured, reviewed adapters/boards; see [ADR-004](adr/ADR-004-source-adapter-architecture.md). `source_key` and `adapter_kind` are deliberately distinct: a single adapter serves multiple boards, each its own `source_key` |
| `source_listings` | `id`, `source_id`, `external_id`, `canonical_source_url`, `application_url`, `first_seen_at`, `last_seen_at`, `status` (`active`\|`removed`), `absence_count`, `opportunity_id` (FK, not null) | One row per (source, external_id) — this is what an adapter actually observed. Never holds descriptive content itself; content lives in `opportunity_versions` |
| `opportunities` | `id`, `status` (`active`\|`stale`\|`closed`\|`unknown`), `first_discovered_at`, `last_checked_at`, `current_version_id` | The **canonical, real-world opportunity**. Holds identity, lifecycle, and timestamps only — no descriptive content |
| `opportunity_versions` | see full field list below | Immutable historical snapshot. Tied to the specific `source_listing_id` whose capture produced it, and to the canonical `opportunity_id`. Insert-only at the grant level for every role, including service_role |
| `ingestion_runs` | `id`, `source_id`, `started_at`, `finished_at`, `status` (`running`\|`complete`\|`partial`\|`failed`), `completeness` (`complete`\|`partial`, null while running/failed), `dry_run`, `records_found`, `records_new`, `records_updated`, `records_closed`, `error_count`, `error_summary` (jsonb, capped) | Operational log, one row per CLI invocation |
| `opportunity_search` (view) | `opportunity_id`, `opportunity_version_id`, `lifecycle_status`, `first_discovered_at`, `last_checked_at`, `source_id`, `source_key`, `source_display_name`, `source_listing_id`, `canonical_source_url`, `title`, `organization`, `description`, `location_text`, `country`, `region`, `city`, `opportunity_kind`, `employment_type`, `remote_mode`, `posted_at`, `application_deadline`, `application_url`, `version_captured_at` | Read model for browsing: one row per opportunity, joined to its current version and provenance. Browser SELECT-only |

### `opportunity_versions` — implemented field list

Every mutable, historically-meaningful fact about a posting lives here, never only on the stable
`opportunities` row. Phase 2A.1 implements a practical subset of the originally sketched field
list — no `category`/`subtype`/career-or-development-specific JSONB (that taxonomy exists to drive
Ranking 1/2, out of scope here — see [OPPORTUNITY_TAXONOMY.md](OPPORTUNITY_TAXONOMY.md)), no
separate `sanitized_display_content` (the single `description` field is already the sanitized,
render-safe text), no `responsibilities`/`required_qualifications`/`preferred_qualifications` split
(folded into `description`), no `parser_version`/`normalizer_version`:

| Field | Purpose |
|---|---|
| `id` | Primary key |
| `opportunity_id` | Canonical opportunity this version belongs to |
| `source_listing_id` | Which source listing's capture produced this version (provenance) |
| `version_number` | Sequential per opportunity |
| `captured_at` | When this snapshot was taken |
| `title`, `organization`, `description` | Sanitized plain text |
| `location_text`, `country`, `region`, `city` | |
| `remote_mode` | `onsite` \| `hybrid` \| `remote` \| `unknown` |
| `opportunity_kind` | Practical trimmed enum: `internship`, `working_student`, `graduate_program`, `entry_level`, `research_assistant`, `phd`, `scholarship`, `hackathon`, `fellowship`, `other` — shared with `private_opportunities` |
| `employment_type` | `full_time`, `part_time`, `contract`, `temporary`, `internship`, `volunteer`, `other` — shared with `private_opportunities` |
| `application_url` | The URL to actually apply, which may differ from `source_listings.canonical_source_url` |
| `posted_at`, `application_deadline`, `source_updated_at` | Nullable — not every source states these |
| `content_hash` | Used for idempotent change detection |
| `source_metadata` | JSONB, bounded (≤ 8 KB): source-specific fields not mapped into the common schema — sanitized, never raw HTML (see §"Raw external-content retention" below) |

`opportunities.current_version_id` always points at the version currently treated as the "live"
content for that opportunity — the latest by `version_number`, set by `apply_source_listing`.

## Scoring domain (shared source data, but scores are computed per user where applicable)

| Table | Key fields | Notes |
|---|---|---|
| `career_market_scores` | `id`, `opportunity_version_id`, `degree_relevance_score`, `geographic_score`, `language_score`, `overall_market_score`, `scoring_version`, `computed_at` | Ranking 1 — not user-specific |
| `career_fit_scores` | `id`, `user_id`, `opportunity_version_id`, `eligibility_status`, `degree_relevance_score`, `skill_alignment_score`, `project_evidence_score`, `experience_alignment_score`, `language_alignment_score`, `location_alignment_score`, `overall_category`, `evidence_jsonb`, `scoring_version`, `computed_at` | Ranking 2 — user-specific; `evidence_jsonb` is the explainability payload (see [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md)) |
| `development_scores` | `id`, `user_id`, `opportunity_version_id`, `distance_km`, `cost_score`, `eligibility_status`, `deadline_urgency_score`, `technical_relevance_score`, `reputation_score`, `resume_value_score`, `time_commitment_score`, `produces_artifact`, `overall_score`, `evidence_jsonb`, `scoring_version`, `computed_at` | User-specific; distance/cost fields nullable when source data is missing (shown as "unknown," never fabricated) |
| `market_skill_mentions` | `id`, `skill_id`, `engineering_area`, `period_start`, `period_end`, `mention_count`, `opportunity_count` | Aggregate table backing market-intelligence view; `opportunity_count` is a count of distinct **canonical** `opportunity_id`s (excluding `status = merged_duplicate` rows), not of `source_listings`, so a posting seen through two sources is never double-counted once confirmed as one opportunity |

**Every score row is keyed to `opportunity_version_id`, never to `opportunity_id` alone — this is
deliberate and non-negotiable.** A fit score describes the user's alignment against one specific,
immutable snapshot of a posting. When a new version is captured (the source changed the posting),
existing score rows are left exactly as they are — they keep describing the version they were
computed against — and a new scoring run computes a new, separate score row against the new
version. The user-visible "current fit" is simply the score row for `opportunities
.current_version_id`; older score rows remain queryable for history/audit but are not what's shown
by default. **A fit score must never silently change because the underlying posting changed** —
if it changes, it is because a new version produced a new score row, and that is visible as a
distinct, timestamped event, not a mutation of the number the user already saw.

## User activity domain (user-owned, RLS-protected)

**Implementation status (Phase 2A.1)**: `user_opportunity_state`, `applications`, `interview_prep_notes`,
and `private_opportunities` are implemented. `tasks` remains a logical target only — MVP_SCOPE.md's
"simple tasks associated with opportunities" is satisfied at Phase 2A.1 by `applications.next_action`/
`next_action_due_at` directly; a standalone `tasks` table (including deadline-derived tasks that exist
before any application) is deferred to a later pass.

| Table | Key fields | Notes |
|---|---|---|
| `user_opportunity_state` | `id`, `user_id`, `opportunity_id`, `saved_at` (nullable), `saved_opportunity_version_id` (nullable, set exactly when `saved_at` is), `hidden_at` (nullable), `notes`, `created_at`, `updated_at` | **Implemented name for what an earlier draft of this document called `saved_opportunities`** — resolved to the name [ADR-018](adr/ADR-018-private-manual-opportunities.md) itself uses when contrasting this table with `private_opportunities.dismissed_at`. One row per `(user_id, opportunity_id)`; a "neither saved nor hidden" state has no row at all (unsave+unhide deletes it). Applies only to shared `opportunities` — a private manual opportunity's existence already means it's saved, and `dismissed_at` is its hide equivalent. Snapshot pinning: `saved_opportunity_version_id` remembers which version the user actually saved and reacted to, even after the opportunity gets new versions later |
| `applications` | `id`, `user_id`, `shared_opportunity_id` (nullable FK to `opportunities`, set and immutable for a shared application — see note below), `opportunity_version_id` (nullable FK to `opportunity_versions`, set and pinned for a shared/ingested opportunity), `private_opportunity_id` (nullable FK to `private_opportunities`, `on delete set null`, set for a manually entered one), `private_opportunity_snapshot` (jsonb, populated only on the manual path — see note below), `status` (`preparing`\|`applied`\|`awaiting_response`\|`interview_scheduled`\|`interview_complete`\|`offer`\|`accepted`\|`rejected`\|`withdrawn`\|`closed`), `applied_at`, `status_updated_at`, `next_action` (nullable), `next_action_due_at` (nullable), `notes`, `contact_note` (nullable) | Current status plus timestamps only — no event-sourced status-history table at MVP (see [MVP_SCOPE.md](MVP_SCOPE.md#current-product-mode-and-engineering-priority)). Exactly one of `opportunity_version_id`/`private_opportunity_snapshot` is set, enforced by both a check constraint and a trigger; the browser has no update grant on either, or on `user_id`/`created_at`, so the pinned source is immutable after creation. A partial unique index on `(user_id, shared_opportunity_id)` (and separately on `(user_id, private_opportunity_id)`) caps the MVP at one application tracker per user per listing — no application-attempt history/event sourcing. `contact_note` holds general recruiter/contact notes; interview-specific observations live on `interview_prep_notes` instead, to avoid two fields with the same purpose. `status_updated_at` advances only when `status` actually changes; an ordinary note edit only advances `updated_at` |
| `interview_prep_notes` | `id`, `application_id` (unique — one row per application), `user_id` (denormalized, server-derived from the application's owner, never client-supplied), `responsibilities_to_discuss`, `required_technologies`, `topics_to_revise`, `likely_questions`, `questions_to_ask`, `interview_date`, `interview_format`, `reflections`, `created_at`, `updated_at` | Plain-text fields, not a single freeform blob, so the pinned listing snapshot and the prep notes can be shown side by side without parsing. No recruiter/contact-note field here — that lives on `applications.contact_note` |
| `private_opportunities` | `id`, `user_id`, `source_url`, `title`, `organization_name`, `location_text`, `opportunity_kind`, `employment_type`, `remote_mode`, `description_text`, `posted_at`, `application_deadline`, `application_url`, `dismissed_at`, `promoted_to_opportunity_id` (nullable, trusted-write only), `created_at`, `updated_at`, `last_confirmed_at` | **Implemented (Phase 2A.1, see [ADR-018](adr/ADR-018-private-manual-opportunities.md))**: manually entered opportunities, structurally and permission-wise separate from the shared identity domain above — not written through the ingestion/dedup pipeline, not versioned like `opportunity_versions` (ordinary mutable CRUD, like `work_experience`), private by default. `opportunity_kind`/`employment_type`/`remote_mode` use the same practical enums as `opportunity_versions` (see the note below). `source_url` is ordinary mutable owner-corrected metadata (browser has an update grant on it, unlike the shared domain's provenance columns) — correcting it never touches an already-captured `applications.private_opportunity_snapshot`, which is a one-time copy taken at application creation and never re-read live. `promoted_to_opportunity_id` is a future, trusted-only, additive link to a canonical shared opportunity if one is later discovered by an adapter; no promotion logic exists yet |

## Raw external-content retention (debug-only, not a core table)

`raw_capture_debug` (`id`, `source_listing_id`, `raw_response`, `captured_at`, `expires_at`) is an
**optional, disabled-by-default** table used only when actively developing or debugging a source
adapter. It is explicitly not part of the product's durability promise — see
[ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy) and
[SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) for the full policy (short retention, never
rendered, never sent to an LLM, never relied upon for reconstructing history — that job belongs
entirely to `opportunity_versions`).

## Design notes

- **Why `source_listings` is a separate layer from `opportunities`**: it lets the same real-world
  posting be observed by more than one adapter without forcing an immediate, possibly-wrong merge
  decision, and it keeps each source's own identity/URL/timestamps intact even after a merge. See
  [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md).
- **Why snapshots pin a specific `opportunity_version_id`** rather than always pointing at "the
  latest": a user's saved reasoning and fit explanation refer to the posting as it existed when
  they looked at it. If requirements change later, the user should see that explicitly as a diff,
  not have their prior judgment silently reinterpreted against new text.
- **Why a shared `applications` row carries both `shared_opportunity_id` and `opportunity_version_id`**,
  rather than deriving "which opportunity is this?" from the pinned version alone: the two answer
  different questions. `opportunity_version_id` must stay pinned to the exact content shown when the
  user applied, even after `ingestion` creates newer versions — that immutability is the whole point
  of the pinned-snapshot design above. But that same immutability means it cannot also answer "is
  this opportunity already applied to?" after a new version becomes current, because the opportunity's
  *current* version and the applications's *pinned* version are now different rows. `shared_opportunity_id`
  is a second, stable FK straight to `opportunities`, derived server-side from `opportunity_version_id`
  at insert time (never client-supplied, never rewritten) purely so the "already applied" check, the
  duplicate-prevention unique index, and the opportunity list's "Applied" badge can all key off an
  identity that survives re-ingestion, while `opportunity_version_id` keeps doing its original job.
- **Why `applications` carries its own `private_opportunity_snapshot_jsonb`** rather than reading
  `private_opportunities` live: a shared opportunity already gets this guarantee for free through
  `saved_opportunities.saved_opportunity_version_id` pointing at an immutable
  `opportunity_versions` row. `private_opportunities` has no such immutable version history — it is
  ordinary mutable CRUD, like `work_experience` — so without its own snapshot, editing a private
  entry after applying (fixing a typo, updating a copied deadline) would silently rewrite the exact
  listing content the application and interview-prep notes refer to. The snapshot is captured once,
  at `applications` creation time, from `private_opportunities`' fields as they stood at that
  moment, and is never updated afterward — this is the smallest relationship that gives both the
  shared and private paths the same "what I applied to is preserved" guarantee without introducing
  version history for `private_opportunities` itself.
- **Why `evidence_jsonb` exists on every score table**: this is the mechanism that satisfies the
  hard explainability requirement in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — every
  sub-score must be traceable to the specific profile fields and posting requirement lines that
  produced it, not just a number.
- **Why `scoring_version` exists**: the scoring algorithm will change over time; historical scores
  remain interpretable (and comparable to the algorithm version that produced them) instead of
  silently becoming inconsistent with newly-computed ones.
- **Why skills are a shared catalog with per-user proficiency rows** rather than free-text tags:
  this is what makes market-skill aggregation ("skills present in the market but missing from your
  profile") possible without fuzzy string matching across the whole dataset.
- **Exact permissions are not repeated here**: see [RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md) for
  the table-by-table, bucket-by-bucket authorization matrix this data model depends on.
