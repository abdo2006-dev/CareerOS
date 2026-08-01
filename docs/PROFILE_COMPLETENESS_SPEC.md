# Profile Completeness Specification

**Status**: proposed Phase 1A contract; not implemented. Version: `profile-completeness/v1`.

This is language-neutral input/output behavior, not shared TypeScript/Python code. Implementations
must produce the named check identifier, outcome, and user-facing explanation below.

## Inputs and outcomes

Inputs are confirmed manual profile rows plus `last_confirmed_at` values. A check returns
`present`, `missing`, `unconfirmed`, or `optional`; Phase 1A has no imported suggestions, while
Phase 1B adds imported-suggestion state. `profiles.profile_complete` is not an input or output.

| Category | Check | Input | Pass / user-facing explanation |
|---|---|---|---|
| Basic matching readiness | `current_education` | current `education_entries` | Present: “Current education is recorded.” Missing: “Add your current education.” |
| Basic matching readiness | `degree_year` | profile or current education degree year | Present: “Degree year is recorded.” Missing: “Add your degree year.” |
| Basic matching readiness | `graduation_timing` | expected graduation date/timing | Present: “Graduation timing is recorded.” Missing: “Add expected graduation timing.” |
| Basic matching readiness | `target_direction` | target engineering area or role type | Present: “Target direction is recorded.” Missing: “Choose a target role or engineering area.” |
| Basic matching readiness | `location_or_remote` | preferred location or remote preference | Present: “Location or remote preference is recorded.” Missing: “Set a location or remote preference.” |
| Basic matching readiness | `language` | `user_languages` | Present: “At least one language is recorded.” Missing: “Add a language.” |
| Basic matching readiness | `eligibility_reviewed` | `work_eligibility.last_confirmed_at` | Present: “Work eligibility was reviewed.” Unconfirmed: “Review your work-eligibility state.” |
| Evidence strength | `experience_or_project` | `work_experience` or `projects` | Present: “You have project or experience evidence.” Missing: “Add a project or experience.” |
| Evidence strength | `technical_skill` | technical `user_skills` | Present: “Technical skills are recorded.” Missing: “Add technical skills.” |
| Evidence strength | `skill_evidence` | evidence per technical skill | Present: “Claimed technical skills have evidence.” Missing: “Link evidence to each claimed technical skill.” |
| Review state | `required_sections_reviewed` | required section confirmations | Present: “Required sections were reviewed.” Unconfirmed: “Review the sections marked for confirmation.” |
| Review state | `imported_suggestions_resolved` | Phase 1B suggestion states | Phase 1A: Optional, “Resume suggestions are not in this phase.” Phase 1B: Present only when none remain unresolved. |
| Optional enrichment | `profile_links` | `profile_links` | Optional: “Add links to make evidence easier to review.” |
| Optional enrichment | `target_companies` | `target_companies` | Optional: “Add target companies to personalize discovery.” |
| Optional enrichment | `additional_languages_and_evidence` | extra languages, projects, evidence | Optional: “More detail can strengthen explanations.” |

## Synthetic test vectors

| ID | Synthetic input summary | Expected notable outcomes |
|---|---|---|
| `minimal-ready` | Current education, degree year, graduation timing, one target role, remote preference, one language, reviewed eligibility; one project; one evidenced technical skill; required sections reviewed | All basic and evidence checks `present`; optional checks remain `optional`. |
| `direction-missing` | Same as `minimal-ready`, without target roles or areas | `target_direction = missing`; explanation asks to choose one. |
| `claim-without-evidence` | Same as `minimal-ready`, but technical skill claim has no evidence | `skill_evidence = missing`; basic readiness stays `present`. |
| `needs-review` | Required fields exist but eligibility and projects lack confirmations | `eligibility_reviewed` and/or `required_sections_reviewed = unconfirmed`. |
| `phase-1b-pending-suggestion` | `minimal-ready` plus an unresolved extracted suggestion | In Phase 1B, `imported_suggestions_resolved = missing`; in Phase 1A this vector is not applicable. |

An implementation may summarize these checks visually, but may not show a percentage as the only
result. Any later weighted percentage must publish each component and weight.
