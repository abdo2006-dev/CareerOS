export type EducationStatus =
  'current' | 'completed' | 'paused' | 'withdrawn' | 'unknown'

export type ExperienceKind =
  | 'employment'
  | 'internship'
  | 'research'
  | 'volunteering'
  | 'student_leadership'
  | 'other'

export type SectionKey = 'basic_profile' | 'education' | 'experience'

export interface ProfileRow {
  user_id: string
  preferred_name: string | null
  headline: string | null
  degree_program: string | null
}

export interface EducationEntry {
  id: string
  user_id: string
  institution: string
  degree: string | null
  field: string | null
  degree_year: number | null
  expected_graduation_month: number | null
  expected_graduation_year: number | null
  education_status: EducationStatus
  is_primary: boolean
  start_date: string | null
  end_date: string | null
}

export interface WorkExperience {
  id: string
  user_id: string
  experience_kind: ExperienceKind
  organization: string
  role: string
  location: string | null
  start_year: number
  start_month: number | null
  end_year: number | null
  end_month: number | null
  is_current: boolean
  description: string | null
}

export interface SectionState {
  section_key: SectionKey
  content_revision: number
  reviewed_content_revision: number | null
}

export type SafeError =
  'network' | 'permission' | 'validation' | 'missing' | 'unknown'

export function safeError(
  error: { code?: string; message?: string } | null,
): SafeError {
  if (!error) return 'unknown'
  if (error.code === '42501') return 'permission'
  if (
    error.code === '23514' ||
    error.code === '23505' ||
    error.code === '22023'
  )
    return 'validation'
  if (error.code === 'PGRST116') return 'missing'
  if (!error.code) return 'network'
  return 'unknown'
}

export function errorMessage(kind: SafeError): string {
  return {
    network: 'We could not reach the service. Please try again.',
    permission: 'You do not have permission to make that change.',
    validation: 'Check the highlighted values and try again.',
    missing: 'This item no longer exists. The page was refreshed.',
    unknown: 'The change could not be saved. Please try again.',
  }[kind]
}
