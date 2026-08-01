import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import { profileRepository } from '../lib/profileRepository'
import { profileReviewRepository } from '../lib/profileReviewRepository'
import type { EducationEntry, SectionState } from '../lib/profileTypes'
import { evaluateEducationSlice } from '../lib/profileCompleteness'

export function ProfilePage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>(
    'loading',
  )
  const [state, setState] = useState<SectionState[] | null>(null)
  const [entries, setEntries] = useState<EducationEntry[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

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
    setEntries(education.data)
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
        {createError && <p role="alert">{createError}</p>}
        <button
          type="button"
          onClick={() =>
            userId &&
            void profileRepository
              .create(userId)
              .then((result) =>
                result.error
                  ? setCreateError(
                      'Profile could not be created. Please try again.',
                    )
                  : load(),
              )
          }
        >
          Create profile
        </button>
      </section>
    )
  const checks = evaluateEducationSlice(entries, state ?? [])
  return (
    <section>
      <h2>Your profile</h2>
      <p>Complete the implemented profile details below.</p>
      <ul>
        {checks.map((check) => (
          <li key={check.id}>
            <strong>{check.id.replaceAll('_', ' ')}:</strong>{' '}
            {check.outcome === 'present' ? (
              'Present'
            ) : (
              <Link to={check.href}>{check.action}</Link>
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
