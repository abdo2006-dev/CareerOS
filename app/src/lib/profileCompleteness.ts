import type { EducationEntry, SectionState } from './profileTypes'

export const completenessVersion =
  'profile-completeness/v2-slice-education' as const
export type CompletenessOutcome = 'present' | 'missing' | 'unconfirmed'
export type CompletenessCheckId =
  | 'basic_profile_review'
  | 'primary_education'
  | 'degree_year'
  | 'graduation_timing'
  | 'education_review'

export interface CompletenessCheck {
  id: CompletenessCheckId
  outcome: CompletenessOutcome
  action: string
  href: string
}

function reviewed(state: SectionState[], section: SectionState['section_key']) {
  const item = state.find((entry) => entry.section_key === section)
  return Boolean(
    item &&
    item.reviewed_content_revision !== null &&
    item.reviewed_content_revision === item.content_revision,
  )
}

export function evaluateEducationSlice(
  entries: EducationEntry[],
  state: SectionState[],
): CompletenessCheck[] {
  const primary = entries.find((entry) => entry.is_primary)
  return [
    {
      id: 'basic_profile_review',
      outcome: reviewed(state, 'basic_profile') ? 'present' : 'unconfirmed',
      action: 'Review basic profile',
      href: '/profile/basic',
    },
    {
      id: 'primary_education',
      outcome: primary ? 'present' : 'missing',
      action: 'Add or select primary education',
      href: '/profile/education',
    },
    {
      id: 'degree_year',
      outcome: primary?.degree_year ? 'present' : 'missing',
      action: 'Add degree year',
      href: '/profile/education',
    },
    {
      id: 'graduation_timing',
      outcome:
        primary?.expected_graduation_month && primary?.expected_graduation_year
          ? 'present'
          : 'missing',
      action: 'Add expected graduation timing',
      href: '/profile/education',
    },
    {
      id: 'education_review',
      outcome: reviewed(state, 'education') ? 'present' : 'unconfirmed',
      action: 'Review education',
      href: '/profile/education',
    },
  ]
}
