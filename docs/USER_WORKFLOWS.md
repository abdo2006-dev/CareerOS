# User Workflows

Status: **proposal**. These are concrete usage scenarios the MVP must support; they exist to keep
architecture and data-model decisions grounded in real usage rather than abstract requirements.

## Workflow 1 — Phase 1A manual profile setup

**Implemented slices**: the routed profile workspace supports basic-profile editing, education
drafts/CRUD, and experience/research CRUD. Experience uses a controlled kind, honest year plus
optional month periods, independent review, and no invented end date for current or unknown-ended
roles. A user explicitly selects one current education as primary; no other entry is promoted
automatically. The overview shows only implemented review checks and labels remaining Phase 1A
sections as not yet available.

1. User signs in and sees a profile overview with named completeness checks and concrete next
   actions, never just a mysterious percentage.
2. User edits education, experience/research, projects/links, skills/evidence, languages,
   preferences, targets, and minimized work eligibility as independent sections.
3. Each section saves independently; it supports empty, loading, success, validation-error,
   server-error, and deletion-confirmation states where applicable.
4. The overview reports what is present, missing, unconfirmed, or optional. The user can mark a
   section reviewed even when intentionally empty. Later section content changes or deletions make
   that review stale through the section revision, so the UI asks for a renewed review rather than
   inferring confirmation from field presence alone.
5. Education may have multiple active entries. The user explicitly chooses at most one primary
   current education entry for matching; its degree year and expected graduation timing feed
   completeness and later matching.

Resume upload, parsing, and imported drafts are Phase 1B workflows. They are not part of Phase 1A;
when built, they follow ADR-014's explicit accept/correct/reject model.

## Workflow 2 — Discovering and understanding the market

1. Scheduled ingestion (see [DATA_FLOW.md](DATA_FLOW.md)) has already pulled and normalized new
   postings from configured sources since the last run.
2. User opens the **Market Relevance** view: opportunities ranked for "is this relevant to an ECE
   student in Germany," independent of the user's own competitiveness. This view is useful even
   before the profile is complete.
3. User filters by engineering area (e.g., power electronics), location (Bremen/Hamburg vs.
   Germany-wide vs. remote), and opportunity type.
4. User opens the **Market Intelligence** summary: most-requested skills and tools this month
   across ingested postings in a chosen category, and which of those skills are and are not
   present in their own profile.

## Workflow 3 — Personal competitiveness review

1. From either the market view or a direct opportunity page, user opens **My Fit**.
2. System shows: eligibility status (hard pass/fail, e.g., "requires EU work authorization" when
   the user doesn't have it), degree relevance score, skill alignment score, project-evidence
   score, experience alignment, language alignment, location alignment, a short list of strengths
   with the profile evidence that produced them, a short list of missing requirements, and one
   recommendation category (Strong target / Realistic / Reach / Currently unsuitable /
   Ineligible).
3. User can click any sub-score to see exactly which resume/profile fields and which posting
   requirement lines produced it.

## Workflow 4 — Preserving and saving an opportunity

1. User saves an opportunity of interest. The system pins the specific `opportunity_version_id`
   currently on screen — a full structured snapshot (title, organization, description,
   responsibilities, required/preferred qualifications, location, remote status, deadline,
   application URL, category/subtype, and category-specific structured fields; see
   [DATA_MODEL.md](DATA_MODEL.md#opportunity_versions--complete-field-list)) — independent of
   whether the source page later changes.
2. If a later ingestion run detects the same posting has changed, a new version is stored and
   linked to the same canonical opportunity, and the user can diff versions (e.g., deadline
   extended, requirements added). The user's saved copy keeps pointing at the version they
   originally saw; it is never silently swapped for the newer one.
3. The fit score shown alongside the saved opportunity is the score computed against that same
   pinned version. If the posting changes and a new version is scored, that produces a new,
   separate score row — the number the user already saw never changes underneath them (see
   [DATA_MODEL.md](DATA_MODEL.md#scoring-domain-shared-source-data-but-scores-are-computed-per-user-where-applicable)).
4. User adds a personal note (e.g., "mentioned by alumnus X," "apply after finishing PCB course").

## Workflow 5 — Development-opportunity discovery (hackathons, scholarships, etc.)

1. User opens the **Development Opportunities** view, ranked by the dimensions in
   [OPPORTUNITY_TAXONOMY.md](OPPORTUNITY_TAXONOMY.md): distance from Bremen, Bremen/Hamburg
   preference, online/in-person, cost, estimated travel cost, student and degree-year eligibility,
   language requirement, deadline urgency, technical relevance, reputation, expected resume value,
   time commitment, and whether it produces a tangible artifact (project, certificate,
   presentation, result).
2. User saves one, e.g. a hackathon three weeks out in Hamburg.

## Workflow 6 — From saved opportunity to application

1. User moves a saved opportunity into the application pipeline: statuses such as *identified →
   preparing → applied → interview scheduled → interview complete → offer / rejected / withdrawn*.
2. Moving to "preparing" lets the user generate simple tasks tied to the opportunity (e.g.,
   "tailor resume bullet on signal-integrity project," "request reference," "submit before
   <deadline>"). At MVP these tasks are user-authored from a short suggested list, not
   AI-autogenerated end to end.
3. User logs interview-prep notes tied to the application record (questions asked, topics to
   review) for later reuse.

## Workflow 7 — Preventing loss on deadline-sensitive postings

1. A scheduled ingestion run notices a previously-active source listing is no longer reachable at
   its source URL (404, removed from listing page, or explicit "closed" marker where the source
   provides one).
2. That `source_listing` is marked `removed`. The canonical opportunity itself is only marked
   `removed` once every source listing feeding it is removed — a posting still live on a
   company's own career page is not marked removed just because one ATS mirror of it disappeared.
3. Whichever status results, the last-known content snapshot is retained (not deleted). If the
   user has it saved or in their pipeline, it remains fully visible with its preserved content —
   only the "is this still open" signal changes.

## Workflow 8 — Reviewing a potential duplicate

1. Ingestion detects that a new, unlinked source listing has weak-but-plausible overlap with an
   existing opportunity (e.g., same organization and very similar title, but no exact shared
   identifier or application URL) and creates a `potential_duplicate_links` row rather than
   merging automatically (see [ADR-010](adr/ADR-010-opportunity-identity-and-cross-source-deduplication.md)).
2. The user sees a short review queue: each pending pair shown side by side with the specific
   matching evidence that triggered the flag.
3. The user confirms ("yes, same posting" — the listing is linked to the existing opportunity and
   its own opportunity row is marked `merged_duplicate`) or rejects ("no, these are genuinely
   different" — both remain independent opportunities and the pair is not re-flagged). Nothing is
   merged without this explicit step.
