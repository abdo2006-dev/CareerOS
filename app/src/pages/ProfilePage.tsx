import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import { profileRepository } from '../lib/profileRepository'
import { profileReviewRepository } from '../lib/profileReviewRepository'
import type { SectionState } from '../lib/profileTypes'

function reviewed(
  state: SectionState[] | null,
  section: SectionState['section_key'],
) {
  const item = state?.find((entry) => entry.section_key === section)
  return item?.reviewed_content_revision === item?.content_revision
}

export function ProfilePage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>(
    'loading',
  )
  const [state, setState] = useState<SectionState[] | null>(null)
  const [hasPrimary, setHasPrimary] = useState(false)
  const [degreeYear, setDegreeYear] = useState(false)
  const [graduation, setGraduation] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const [profile, education, sections] = await Promise.all([
      profileRepository.get(userId),
      educationRepository.list(userId),
      profileReviewRepository.state(userId),
    ])
    if (profile.error || education.error || sections.error)
      return setStatus('error')
    if (!profile.data) return setStatus('empty')
    const primary = education.data.find((entry) => entry.is_primary)
    setHasPrimary(Boolean(primary))
    setDegreeYear(Boolean(primary?.degree_year))
    setGraduation(
      Boolean(
        primary?.expected_graduation_month && primary?.expected_graduation_year,
      ),
    )
    setState(sections.data)
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])
  if (status === 'loading')
    return (
      <section>
        <h2>Your profile</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'error')
    return (
      <section>
        <h2>Your profile</h2>
        <p role="alert">Your profile could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )
  if (status === 'empty')
    return (
      <section>
        <h2>Your profile</h2>
        <p>No profile yet.</p>
        <button
          type="button"
          onClick={() =>
            userId && void profileRepository.create(userId).then(load)
          }
        >
          Create profile
        </button>
      </section>
    )
  const checks = [
    [
      'Basic profile review',
      reviewed(state, 'basic_profile'),
      '/profile/basic',
      'Review basic profile',
    ],
    [
      'Primary education',
      hasPrimary,
      '/profile/education',
      'Add or select primary education',
    ],
    ['Degree year', degreeYear, '/profile/education', 'Add degree year'],
    [
      'Expected graduation',
      graduation,
      '/profile/education',
      'Add expected graduation timing',
    ],
    [
      'Education review',
      reviewed(state, 'education'),
      '/profile/education',
      'Review education',
    ],
  ]
  return (
    <section>
      <h2>Your profile</h2>
      <p>Complete the implemented profile details below.</p>
      <ul>
        {checks.map(([label, ok, href, action]) => (
          <li key={label as string}>
            <strong>{label as string}:</strong>{' '}
            {ok ? (
              'Present'
            ) : (
              <Link to={href as string}>{action as string}</Link>
            )}
          </li>
        ))}
      </ul>
      <h3>Not yet available</h3>
      <p>
        Experience, skills, languages, preferences, targets, and work
        eligibility are not yet available in CareerOS.
      </p>
    </section>
  )
}
