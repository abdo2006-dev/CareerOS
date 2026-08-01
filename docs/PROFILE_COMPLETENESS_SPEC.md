# Profile Completeness Specification

**Status**: proposed Phase 1A contract; not implemented. Version: `profile-completeness/v2`.

This is language-neutral input/output behavior, not shared TypeScript/Python code. An
implementation returns every named check's identifier, category, outcome, deterministic
user-facing explanation, and any stated counts. `profiles.profile_complete` is not an input or
output.

## Inputs, outcomes, and review freshness

Inputs are confirmed manual profile rows, controlled catalog metadata, and section-review data.
The outcomes are `present`, `missing`, `unconfirmed`, and `optional`. `present` means the check's
non-blocking or blocking input exists; `optional` means absent content does not block readiness.
`missing` means required content is absent; `unconfirmed` means required content exists but has
not been deliberately and currently reviewed.

Initial review keys are `basic_profile`, `education`, `experience`, `projects`, `skills`,
`languages`, `preferences`, and `work_eligibility`. A review is current only when a
`profile_section_reviews` row exists, its recorded content revision equals the current
`profile_section_revisions` value, and `reviewed_at` is at least the latest relevant surviving
row's `updated_at`. A revision increments for relevant create, update, **and delete**, so deleting
the newest row cannot make an older review look current. An empty section can therefore be
reviewed deliberately at revision zero (or its current post-deletion revision).

Basic matching readiness requires current reviews of `basic_profile`, `education`, `skills`,
`languages`, `preferences`, and `work_eligibility`. Experience and projects may be intentionally
empty and reviewed; they do not block basic readiness, but affect evidence strength.

| Category | Check | Input and outcome | User-facing explanation |
|---|---|---|---|
| Basic matching readiness | `current_education` | The **primary** `education_entries` row only, with current `education_status`. `present` when it exists; `missing` otherwise. | Present: “Primary current education is recorded.” Missing: “Choose a primary current education entry.” |
| Basic matching readiness | `degree_year` | The primary education's `degree_year` only. `present` when recorded; `missing` otherwise. | “Add the current degree year to your primary education.” |
| Basic matching readiness | `graduation_timing` | Expected graduation month and year on the primary education only. `present` only when both exist; `missing` otherwise. | “Add expected graduation month and year to your primary education.” |
| Basic matching readiness | `target_direction` | One target engineering area or role type. | Present: “Target direction is recorded.” Missing: “Choose a target role or engineering area.” |
| Basic matching readiness | `location_or_remote` | One preferred location or a recorded remote preference. | Present: “Location or remote preference is recorded.” Missing: “Set a location or remote preference.” |
| Basic matching readiness | `language` | At least one `user_languages` row. | Present: “At least one language is recorded.” Missing: “Add a language.” |
| Basic matching readiness | `eligibility_reviewed` | `work_eligibility` exists, `last_confirmed_at` is at least its `updated_at`, and its section review is current. | Present: “Work eligibility was reviewed.” Missing: “Add your work-eligibility state.” Unconfirmed: “Review your work-eligibility state.” |
| Evidence strength | `experience_or_project` | At least one `work_experience` or `projects` row. | Present: “You have project or experience evidence.” Missing: “Add a project or experience.” |
| Evidence strength | `technical_skill` | At least one technical `user_skills` claim. Canonical claims use the catalog's controlled technical classification; private custom labels count only when explicitly self-classified technical, and never enter shared aggregation. | Present: “Technical skills are recorded.” Missing: “Add a technical skill.” |
| Evidence strength | `skill_evidence` | Return `technical_skill_count` and `technical_skills_lacking_evidence`. `present` only when count is at least one and none lack evidence; `missing` when count is zero or any lack evidence. | Zero: “Add a technical skill before linking evidence.” Partial: “Link evidence to each claimed technical skill.” Present: “All technical skills have evidence.” |
| Review state | `required_sections_reviewed` | Current reviews for all six basic-readiness sections named above. | Present: “Required sections were reviewed.” Unconfirmed: “Review the sections marked for confirmation.” |
| Review state | `experience_and_projects_reviewed` | Current review of both sections; either may be intentionally empty. This does not change basic readiness. | Present: “Experience and projects were reviewed.” Unconfirmed: “Review your experience and projects sections, even if empty.” |
| Review state | `imported_suggestions_resolved` | Phase 1B suggestion state only. | Phase 1A: Optional, “Resume suggestions are not in this phase.” Phase 1B: present only when none remain unresolved. |
| Optional enrichment | `profile_links` | One or more `profile_links` rows. | Present: “Profile links are available as supporting context.” Optional: “Add a link to make evidence easier to review.” |
| Optional enrichment | `target_companies` | One or more `target_companies` rows. | Present: “Target companies are recorded.” Optional: “Add target companies to personalize discovery.” |
| Optional enrichment | `additional_languages` | More than one language row. | Present: “Additional languages are recorded.” Optional: “Add another language if it broadens your opportunities.” |
| Optional enrichment | `additional_evidence` | More than the minimum one evidence item, or evidence across more than one source type. | Present: “Additional evidence strengthens explanations.” Optional: “Add more project, experience, education, link, or note evidence.” |

Basic matching readiness and evidence strength remain separate: a profile can be basic-ready while
evidence strength is incomplete. No percentage is the sole result. A later percentage is allowed
only if every component and weight is published.

## Synthetic test vectors

All inputs below are public-safe and synthetic. “Current review” means the review revision equals
the section revision; “stale” means it does not.

| ID | Synthetic input summary | Expected notable outcomes |
|---|---|---|
| `primary-among-multiple-active` | Two active education entries; exactly one is primary and has year/graduation timing; all required reviews current. | Education, degree year, and graduation timing are `present` from the primary only. |
| `no-primary-education` | Active education entries exist but none is primary. | `current_education`, `degree_year`, and `graduation_timing` are `missing`. |
| `empty-experience-reviewed` | No experience rows; experience review current. Required basics complete. | Experience review is `present`; basic readiness is unaffected; `experience_or_project` depends on projects. |
| `content-modified-after-review` | Skills content revision incremented after its review. | `required_sections_reviewed` is `unconfirmed`; skills review requires renewal. |
| `content-deleted-after-review` | Latest project deleted after review, incrementing projects revision. | Projects review is `unconfirmed`, not falsely current. |
| `link-absent` | No profile links. | `profile_links = optional`. |
| `link-present` | One valid profile link. | `profile_links = present`. |
| `technical-skills-absent` | No technical claims. | `technical_skill = missing`; `skill_evidence = missing` with count 0. |
| `technical-skill-without-evidence` | One technical claim and no evidence rows. | `technical_skill = present`; `skill_evidence = missing`, lacking count 1. |
| `partial-technical-evidence` | Three technical claims; evidence for two. | `skill_evidence = missing`, count 3 and lacking count 1. |
| `all-technical-skills-evidenced` | Two technical claims, each with one valid typed evidence row. | `technical_skill` and `skill_evidence` are `present`; lacking count 0. |
| `eligibility-stale` | Work-eligibility row exists, but its confirmation or section review predates a change. | `eligibility_reviewed = unconfirmed`. |

The next implementation vertical slice evaluates only checks whose inputs exist in that slice; all
other checks are reported as **not yet implemented by the product**, not as user omissions. The
full v2 evaluation begins only after its remaining Phase 1A tables exist.
