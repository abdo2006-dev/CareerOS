import { describe, expect, it } from 'vitest'
import { computeContentHash, normalizeUrl } from '../src/identity.js'
import type { NormalizedListing } from '../src/adapters/types.js'

function listing(
  overrides: Partial<NormalizedListing> = {},
): NormalizedListing {
  return {
    externalId: '1',
    canonicalUrl: 'https://example.test/jobs/1',
    applicationUrl: 'https://example.test/jobs/1',
    title: 'Working Student',
    organization: 'Example GmbH',
    description: 'Description text.',
    locationText: 'Bremen, Germany',
    country: null,
    region: null,
    city: null,
    remoteMode: 'onsite',
    opportunityKind: 'working_student',
    employmentType: 'internship',
    postedAt: '2026-06-01T00:00:00Z',
    applicationDeadline: null,
    sourceUpdatedAt: '2026-06-01T00:00:00Z',
    sourceMetadata: {},
    ...overrides,
  }
}

describe('normalizeUrl', () => {
  it('lowercases scheme and host', () => {
    expect(normalizeUrl('HTTPS://Example.TEST/Jobs/1')).toBe(
      'https://example.test/Jobs/1',
    )
  })

  it('strips the fragment and default port', () => {
    expect(normalizeUrl('https://example.test:443/jobs/1#apply')).toBe(
      'https://example.test/jobs/1',
    )
  })

  it('collapses duplicate slashes and strips one trailing slash', () => {
    expect(normalizeUrl('https://example.test//jobs//1/')).toBe(
      'https://example.test/jobs/1',
    )
  })

  it('is stable across equivalent inputs', () => {
    const a = normalizeUrl('https://example.test/jobs/1/')
    const b = normalizeUrl('HTTPS://EXAMPLE.test/jobs/1#section')
    expect(a).toBe(b)
  })
})

describe('computeContentHash', () => {
  it('is deterministic for identical listings', () => {
    expect(computeContentHash(listing())).toBe(computeContentHash(listing()))
  })

  it('changes when a historically-meaningful field changes', () => {
    const base = computeContentHash(listing())
    const changed = computeContentHash(listing({ description: 'Different.' }))
    expect(changed).not.toBe(base)
  })

  it('does not change when only source_metadata differs', () => {
    const a = computeContentHash(
      listing({ sourceMetadata: { departments: ['A'] } }),
    )
    const b = computeContentHash(
      listing({ sourceMetadata: { departments: ['B'] } }),
    )
    expect(a).toBe(b)
  })

  it('does not collide when a value shifts across the field boundary', () => {
    const a = computeContentHash(listing({ title: 'AB', organization: 'CD' }))
    const b = computeContentHash(listing({ title: 'A', organization: 'BCD' }))
    expect(a).not.toBe(b)
  })
})
