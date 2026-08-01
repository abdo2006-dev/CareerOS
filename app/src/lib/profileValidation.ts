import type { EducationInput } from './educationRepository'

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
  const month = values.expected_graduation_month
  const year = values.expected_graduation_year
  if ((month === '') !== (year === ''))
    errors.graduation = 'Enter both graduation month and year, or neither.'
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
  return errors
}
