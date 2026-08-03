import type {
  EducationEntry,
  SectionState,
  WorkExperience,
} from './profileTypes'

export const completenessVersion =
  'profile-completeness/v2-slice-experience' as const
export type CompletenessOutcome = 'present' | 'missing' | 'unconfirmed'
export type CompletenessCheckId =
  | 'basic_profile_review'
  | 'primary_education'
  | 'degree_year'
  | 'graduation_timing'
  | 'education_review'
  | 'experience_review'
  | 'projects'
  | 'skills'
  | 'languages'
  | 'preferences'
  | 'eligibility'
  | 'targets'

export interface CompletenessCheck {
  id: CompletenessCheckId
  availability: 'implemented' | 'not_implemented'
  outcome: CompletenessOutcome | null
  action: string
  href: string | null
}

function reviewed(state: SectionState[], section: SectionState['section_key']) {
  const item = state.find((entry) => entry.section_key === section)
  return Boolean(
    item &&
    item.reviewed_content_revision !== null &&
    item.reviewed_content_revision === item.content_revision,
  )
}

export function evaluateExperienceSlice(
  entries: EducationEntry[],
  state: SectionState[],
  experience: WorkExperience[],
): CompletenessCheck[] {
  // Projects are deferred, so experience rows do not yet drive the final
  // experience-or-project evidence-strength check. Keep the evaluator input
  // explicit for the next slice rather than duplicating overview logic.
  void experience
  const primary = entries.find((entry) => entry.is_primary)
  return [
    {
      id: 'basic_profile_review',
      availability: 'implemented',
      outcome: reviewed(state, 'basic_profile') ? 'present' : 'unconfirmed',
      action: 'Review basic profile',
      href: '/profile/basic',
    },
    {
      id: 'primary_education',
      availability: 'implemented',
      outcome: primary ? 'present' : 'missing',
      action: 'Add or select primary education',
      href: '/profile/education',
    },
    {
      id: 'degree_year',
      availability: 'implemented',
      outcome: primary?.degree_year ? 'present' : 'missing',
      action: 'Add degree year',
      href: '/profile/education',
    },
    {
      id: 'graduation_timing',
      availability: 'implemented',
      outcome:
        primary?.expected_graduation_month && primary?.expected_graduation_year
          ? 'present'
          : 'missing',
      action: 'Add expected graduation timing',
      href: '/profile/education',
    },
    {
      id: 'education_review',
      availability: 'implemented',
      outcome: reviewed(state, 'education') ? 'present' : 'unconfirmed',
      action: 'Review education',
      href: '/profile/education',
    },
    {
      id: 'experience_review',
      availability: 'implemented',
      outcome: reviewed(state, 'experience') ? 'present' : 'unconfirmed',
      action: 'Review experience',
      href: '/profile/experience',
    },
    ...[
      ['projects', 'Projects are not yet available.'],
      ['skills', 'Skills are not yet available.'],
      ['languages', 'Languages are not yet available.'],
      ['preferences', 'Preferences are not yet available.'],
      ['eligibility', 'Work eligibility is not yet available.'],
      ['targets', 'Targets are not yet available.'],
    ].map(([id, action]) => ({
      id: id as CompletenessCheckId,
      availability: 'not_implemented' as const,
      outcome: null,
      action,
      href: null,
    })),
  ]
}
