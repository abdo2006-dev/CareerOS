import { describe, expect, it } from 'vitest'
import {
  completenessVersion,
  evaluateEducationSlice,
} from './profileCompleteness'

describe('education completeness slice', () => {
  it('is versioned and exposes named missing actions without a percentage', () => {
    const checks = evaluateEducationSlice(
      [],
      [
        {
          section_key: 'basic_profile',
          content_revision: 0,
          reviewed_content_revision: 0,
        },
        {
          section_key: 'education',
          content_revision: 0,
          reviewed_content_revision: null,
        },
      ],
    )
    expect(completenessVersion).toBe('profile-completeness/v2-slice-education')
    expect(
      checks.find((check) => check.id === 'primary_education'),
    ).toMatchObject({
      outcome: 'missing',
      action: 'Add or select primary education',
    })
    expect(
      checks.find((check) => check.id === 'education_review'),
    ).toMatchObject({ outcome: 'unconfirmed' })
  })
})
