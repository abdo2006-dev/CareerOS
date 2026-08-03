import { describe, expect, it } from 'vitest'
import {
  completenessVersion,
  evaluateExperienceSlice,
} from './profileCompleteness'

describe('experience completeness slice', () => {
  it('is versioned and exposes named missing actions without a percentage', () => {
    const checks = evaluateExperienceSlice(
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
      [],
    )
    expect(completenessVersion).toBe('profile-completeness/v2-slice-experience')
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

  it('never treats missing, null, or stale review state as current', () => {
    expect(
      evaluateExperienceSlice([], [], []).find(
        (check) => check.id === 'basic_profile_review',
      )?.outcome,
    ).toBe('unconfirmed')
    expect(
      evaluateExperienceSlice(
        [],
        [
          {
            section_key: 'basic_profile',
            content_revision: 2,
            reviewed_content_revision: null,
          },
        ],
        [],
      ).find((check) => check.id === 'basic_profile_review')?.outcome,
    ).toBe('unconfirmed')
    expect(
      evaluateExperienceSlice(
        [],
        [
          {
            section_key: 'basic_profile',
            content_revision: 2,
            reviewed_content_revision: 1,
          },
        ],
        [],
      ).find((check) => check.id === 'basic_profile_review')?.outcome,
    ).toBe('unconfirmed')
  })

  it('reports an empty reviewed experience section as present and deferred work as neutral', () => {
    const checks = evaluateExperienceSlice(
      [],
      [
        {
          section_key: 'experience',
          content_revision: 0,
          reviewed_content_revision: 0,
        },
      ],
      [],
    )
    expect(
      checks.find((check) => check.id === 'experience_review'),
    ).toMatchObject({ availability: 'implemented', outcome: 'present' })
    expect(checks.find((check) => check.id === 'projects')).toMatchObject({
      availability: 'not_implemented',
      outcome: null,
    })
  })
})
