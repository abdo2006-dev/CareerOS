import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import { experienceRepository } from '../lib/experienceRepository'
import { profileRepository } from '../lib/profileRepository'
import { profileReviewRepository } from '../lib/profileReviewRepository'
import type {
  EducationEntry,
  SectionState,
  WorkExperience,
} from '../lib/profileTypes'
import { evaluateExperienceSlice } from '../lib/profileCompleteness'

export function ProfilePage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>(
    'loading',
  )
  const [state, setState] = useState<SectionState[] | null>(null)
  const [entries, setEntries] = useState<EducationEntry[]>([])
  const [experience, setExperience] = useState<WorkExperience[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const [profile, education, experienceResult, sections] = await Promise.all([
      profileRepository.get(userId),
      educationRepository.list(userId),
      experienceRepository.list(userId),
      profileReviewRepository.state(userId),
    ])
    if (
      profile.error ||
      education.error ||
      experienceResult.error ||
      sections.error
    )
      return setStatus('error')
    if (!profile.data) return setStatus('empty')
    setEntries(education.data)
    setExperience(experienceResult.data)
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
  const checks = evaluateExperienceSlice(entries, state ?? [], experience)
  const implementedChecks = checks.filter(
    (check) => check.availability === 'implemented',
  )
  const deferredChecks = checks.filter(
    (check) => check.availability === 'not_implemented',
  )
  return (
    <section className="profile-overview">
      <header className="profile-heading">
        <p className="eyebrow">Personal profile</p>
        <h1>Your profile</h1>
        <p>
          Build the essentials that will make your opportunity workflow more
          useful over time.
        </p>
      </header>
      <section className="profile-section-card">
        <div>
          <p className="eyebrow">Profile foundations</p>
          <h2>Keep your details current</h2>
        </div>
        <div className="profile-checks">
          {implementedChecks.map((check) => (
            <div className="profile-check" key={check.id}>
              <span
                className={
                  check.outcome === 'present'
                    ? 'check-complete'
                    : 'check-pending'
                }
              >
                {check.outcome === 'present' ? '✓' : '→'}
              </span>
              <div>
                <strong>{check.id.replaceAll('_', ' ')}</strong>
                <small>
                  {check.outcome === 'present' ? 'Up to date' : check.action}
                </small>
              </div>
              {check.outcome !== 'present' && check.href && (
                <Link to={check.href}>Open</Link>
              )}
            </div>
          ))}
        </div>
      </section>
      {deferredChecks.length > 0 && (
        <section className="profile-section-card profile-later">
          <p className="eyebrow">Coming later</p>
          <h2>More profile sections will appear here</h2>
          <p>
            Projects, skills, languages, preferences and work eligibility are
            planned next.
          </p>
        </section>
      )}
    </section>
  )
}
