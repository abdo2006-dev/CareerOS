import type { EducationInput } from './educationRepository'
import type { ExperienceInput } from './experienceRepository'

export type FieldErrors = Record<string, string>
const trimmed = (value: string) => value.trim()
const optional = (value: string) => (trimmed(value) ? trimmed(value) : null)

export function normalizeProfile(preferredName: string, headline: string) {
  return {
    preferred_name: optional(preferredName),
    headline: optional(headline),
  }
}

export function validateProfile(
  preferredName: string,
  headline: string,
): FieldErrors {
  const errors: FieldErrors = {}
  if (trimmed(preferredName).length > 100)
    errors.preferred_name = 'Preferred name must be 100 characters or fewer.'
  if (trimmed(headline).length > 160)
    errors.headline = 'Headline must be 160 characters or fewer.'
  return errors
}

export function normalizeEducation(
  values: Record<string, string>,
): EducationInput {
  const number = (value: string) => (value === '' ? null : Number(value))
  return {
    institution: trimmed(values.institution),
    degree: optional(values.degree),
    field: optional(values.field),
    degree_year: number(values.degree_year),
    expected_graduation_month: number(values.expected_graduation_month),
    expected_graduation_year: number(values.expected_graduation_year),
    education_status:
      values.education_status as EducationInput['education_status'],
    start_date: values.start_date || null,
    end_date: values.end_date || null,
  }
}

export function validateEducation(values: Record<string, string>): FieldErrors {
  const errors: FieldErrors = {}
  if (!trimmed(values.institution))
    errors.institution = 'Institution is required.'
  if (trimmed(values.institution).length > 200)
    errors.institution = 'Institution must be 200 characters or fewer.'
  if (trimmed(values.degree).length > 160)
    errors.degree = 'Degree must be 160 characters or fewer.'
  if (trimmed(values.field).length > 160)
    errors.field = 'Field must be 160 characters or fewer.'
  const degreeYear = Number(values.degree_year)
  if (
    values.degree_year &&
    (!Number.isInteger(degreeYear) || degreeYear < 1 || degreeYear > 10)
  )
    errors.degree_year = 'Degree year must be between 1 and 10.'
  const month = values.expected_graduation_month
  const year = values.expected_graduation_year
  if ((month === '') !== (year === ''))
    errors.graduation = 'Enter both graduation month and year, or neither.'
  if (
    month &&
    (!Number.isInteger(Number(month)) ||
      Number(month) < 1 ||
      Number(month) > 12)
  )
    errors.expected_graduation_month =
      'Graduation month must be between 1 and 12.'
  if (
    year &&
    (!Number.isInteger(Number(year)) ||
      Number(year) < 2000 ||
      Number(year) > 2100)
  )
    errors.expected_graduation_year =
      'Graduation year must be between 2000 and 2100.'
  if (values.education_status !== 'current' && (month || year))
    errors.graduation = 'Expected graduation is only for current education.'
  if (values.education_status === 'current' && values.end_date)
    errors.end_date = 'Current education cannot have an end date.'
  if (values.education_status === 'completed' && !values.end_date)
    errors.end_date = 'Completed education needs an end date.'
  if (
    values.start_date &&
    values.end_date &&
    values.end_date < values.start_date
  )
    errors.end_date = 'End date cannot precede start date.'
  if (
    values.start_date &&
    month &&
    year &&
    `${year}-${month.padStart(2, '0')}-01` <
      `${values.start_date.slice(0, 7)}-01`
  )
    errors.graduation = 'Expected graduation cannot precede the start month.'
  return errors
}

const experienceKinds: ExperienceInput['experience_kind'][] = [
  'employment',
  'internship',
  'research',
  'volunteering',
  'student_leadership',
  'other',
]

export function normalizeExperience(
  values: Record<string, string>,
): ExperienceInput {
  const number = (value: string) => (value === '' ? null : Number(value))
  return {
    experience_kind:
      values.experience_kind as ExperienceInput['experience_kind'],
    organization: trimmed(values.organization),
    role: trimmed(values.role),
    location: optional(values.location),
    start_year: Number(values.start_year),
    start_month: number(values.start_month),
    end_year: number(values.end_year),
    end_month: number(values.end_month),
    is_current: values.is_current === 'true',
    description: optional(values.description),
  }
}

export function validateExperience(
  values: Record<string, string>,
): FieldErrors {
  const errors: FieldErrors = {}
  if (
    !experienceKinds.includes(
      values.experience_kind as ExperienceInput['experience_kind'],
    )
  )
    errors.experience_kind = 'Choose an experience kind.'
  if (!trimmed(values.organization))
    errors.organization = 'Organization is required.'
  if (trimmed(values.organization).length > 200)
    errors.organization = 'Organization must be 200 characters or fewer.'
  if (!trimmed(values.role)) errors.role = 'Role is required.'
  if (trimmed(values.role).length > 160)
    errors.role = 'Role must be 160 characters or fewer.'
  if (trimmed(values.location).length > 160)
    errors.location = 'Location must be 160 characters or fewer.'
  if (trimmed(values.description).length > 2000)
    errors.description = 'Description must be 2,000 characters or fewer.'

  const startYear = Number(values.start_year)
  if (
    !values.start_year ||
    !Number.isInteger(startYear) ||
    startYear < 1900 ||
    startYear > 2100
  )
    errors.start_year = 'Start year must be between 1900 and 2100.'

  const monthIsValid = (value: string) =>
    Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12
  if (values.start_month && !monthIsValid(values.start_month))
    errors.start_month = 'Start month must be between 1 and 12.'
  if (values.end_month && !monthIsValid(values.end_month))
    errors.end_month = 'End month must be between 1 and 12.'

  const endYear = values.end_year ? Number(values.end_year) : null
  if (
    endYear !== null &&
    (!Number.isInteger(endYear) || endYear < 1900 || endYear > 2100)
  )
    errors.end_year = 'End year must be between 1900 and 2100.'
  if (values.end_month && !values.end_year)
    errors.end_month = 'Enter an end year before adding an end month.'

  if (values.is_current === 'true' && (values.end_year || values.end_month))
    errors.end_period = 'Current experience cannot have an end period.'
  if (endYear !== null && Number.isInteger(startYear)) {
    if (endYear < startYear)
      errors.end_period = 'End year cannot precede start year.'
    if (
      endYear === startYear &&
      values.start_month &&
      values.end_month &&
      Number(values.end_month) < Number(values.start_month)
    )
      errors.end_period =
        'End month cannot precede start month in the same year.'
  }
  return errors
}
