import { describe, expect, it } from 'vitest'
import { normalizeExperience, validateExperience } from './profileValidation'

const valid = {
  experience_kind: 'internship',
  organization: 'Example Organization',
  role: 'Engineering Intern',
  location: '',
  start_year: '2025',
  start_month: '',
  end_year: '',
  end_month: '',
  is_current: 'false',
  description: '',
}

describe('experience validation', () => {
  it('normalizes optional plain-text fields without inventing month precision', () => {
    expect(
      normalizeExperience({
        ...valid,
        organization: ' Example Organization ',
        role: ' Engineering Intern ',
      }),
    ).toMatchObject({
      organization: 'Example Organization',
      role: 'Engineering Intern',
      start_month: null,
      end_month: null,
    })
  })

  it('rejects invalid kinds, text, years, and months', () => {
    expect(
      validateExperience({
        ...valid,
        experience_kind: 'unknown',
        organization: ' ',
        role: ' ',
        start_year: '1800',
        start_month: '13',
        end_year: '2200',
      }),
    ).toMatchObject({
      experience_kind: expect.any(String),
      organization: expect.any(String),
      role: expect.any(String),
      start_year: expect.any(String),
      start_month: expect.any(String),
      end_year: expect.any(String),
    })
  })

  it('rejects impossible current and ordered end periods', () => {
    expect(
      validateExperience({
        ...valid,
        start_month: '7',
        end_year: '2025',
        end_month: '6',
      }).end_period,
    ).toMatch(/End month cannot precede/i)
    expect(
      validateExperience({
        ...valid,
        is_current: 'true',
        end_year: '2026',
      }).end_period,
    ).toMatch(/Current experience cannot have an end period/i)
  })

  it('accepts honest same-year partial months and an unknown non-current end', () => {
    expect(
      validateExperience({
        ...valid,
        end_year: '2025',
        end_month: '1',
      }),
    ).toEqual({})
  })
})
