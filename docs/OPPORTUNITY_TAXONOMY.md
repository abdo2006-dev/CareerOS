# Opportunity Taxonomy

Status: **confirmed direction** for the two-category split (specified in the project brief);
specific field lists and weightings are **proposals** refined in
[SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md).

## Why two categories

Career opportunities and development opportunities answer different questions. A career
opportunity asks "could I get this, and should I apply." A development opportunity asks "is this
worth my time and money to build toward future career opportunities." Scoring them on the same
axes would blur both. Both categories share one normalized storage schema (see
[DATA_MODEL.md](DATA_MODEL.md)) with a `category` discriminator and category-specific scoring
tables, so ingestion, storage, and versioning logic stay unified while ranking logic stays
specialized.

## Category: Career opportunities

**Includes**: internships, working-student roles, research-assistant roles, student engineering
jobs, and relevant company/university programmes (e.g., graduate-track pipelines a first/second-year
student can realistically enter).

**Gets two independent rankings:**

### Ranking 1 — Degree and market relevance

Answers: "is this the kind of role an ECE student in Germany should know exists," regardless of
whether *this specific user* currently qualifies. Inputs: field/discipline match against the
engineering-area list, degree-level appropriateness (does it target students at all, vs.
experienced-hire-only), geographic scope (Germany-wide, with Bremen/Hamburg weighting applied as a
ranking boost, not a filter), and language of the posting/workplace. This ranking is
profile-independent and is useful even for a brand-new, empty profile — it exists to teach the
user what the market looks like.

### Ranking 2 — Personal competitiveness

Answers: "how well does this specific user currently match, and what's missing." Computed against
the saved profile (education, skills, projects, languages, location preferences, work eligibility,
experience). See [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md) for the full
sub-score list, the explainability requirement, and the explicit rule against presenting this as a
calibrated acceptance probability.

## Category: Development opportunities

**Includes**: hackathons, engineering competitions, research programmes, summer schools,
scholarships, technical workshops, career fairs, company insight events, open-source programmes,
and student conferences.

**Gets a single ranking**, built from dimensions that reflect time/money cost versus resume value
rather than "will I get in" (most of these have low or no formal admission bar, or a bar that is
binary eligibility rather than competitive scoring):

| Dimension | What it captures |
|---|---|
| Distance from Bremen | Practical travel burden |
| Bremen/Hamburg preference | Matches the user's stated geographic priority |
| Online or in-person | Availability without travel |
| Participation cost | Registration/ticket fees |
| Estimated travel cost | Transport + lodging, where determinable |
| Student eligibility | Is the program open to students at all |
| Degree-year eligibility | Is it open to a rising 2nd-year specifically |
| Language requirement | English-friendliness |
| Deadline | Urgency, feeds directly into task generation |
| Technical relevance | Match to the engineering-area list |
| Reputation | Organizer credibility (university, established company, known competition series) |
| Expected resume value | How well it signals initiative/skill to an employer |
| Time commitment | Hours/days required |
| Tangible output | Whether it produces a project, certificate, presentation, or measurable result |

Several of these (cost, distance, reputation) require source data that is often missing or
inconsistent; the scoring model must degrade gracefully (show "unknown" rather than a fabricated
value) — see [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md).

## Shared normalized schema

Both categories are stored as `opportunities` rows with a `category` field (`career` |
`development`) and a `subtype` field (e.g., `internship`, `working_student`, `hackathon`,
`scholarship`). Fields common to both: title, organization, description, location, remote flag,
deadline, source, source URL, first-discovered date, last-checked date, active/removed status, and
version history. Category-specific structured fields (responsibilities and
required/preferred qualifications for career opportunities; cost, time commitment, and output type
for development opportunities) live in category-specific JSONB payloads or side tables — see
[DATA_MODEL.md](DATA_MODEL.md) for the exact shape.

## Classification process

Source adapters classify at ingestion time using source-provided metadata where available (e.g.,
an ATS job board's own category field) and a small deterministic keyword/pattern ruleset as a
fallback. Ambiguous cases default to `career` with a `needs_review` flag rather than being
silently dropped or silently misfiled; a human (the user, at MVP scale) can reclassify. This
mirrors the project's general preference for deterministic rules before LLM judgment — see
[ADR-005](adr/ADR-005-explainable-ranking-before-llm-ranking.md).
