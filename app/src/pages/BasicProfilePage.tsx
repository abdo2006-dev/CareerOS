import { Link } from 'react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { profileRepository } from '../lib/profileRepository'
import {
  profileReviewRepository,
  reviewStatus,
} from '../lib/profileReviewRepository'
import { normalizeProfile, validateProfile } from '../lib/profileValidation'
import { errorMessage, safeError } from '../lib/profileTypes'

export function BasicProfilePage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [legacy, setLegacy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pageState, setPageState] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [sectionState, setSectionState] = useState<
    'current' | 'stale' | 'not_reviewed'
  >('not_reviewed')
  const load = useCallback(async () => {
    if (!userId) return
    setPageState('loading')
    const profile = await profileRepository.get(userId)
    if (profile.error) {
      setMessage(errorMessage(safeError(profile.error)))
      setPageState('error')
      return
    }
    if (!profile.data) {
      setMessage('Your root profile does not exist yet.')
      setPageState('missing')
      return
    }
    setName(profile.data.preferred_name ?? '')
    setHeadline(profile.data.headline ?? '')
    setLegacy(profile.data.degree_program)
    const sections = await profileReviewRepository.state(userId)
    if (sections.error) {
      setMessage(errorMessage(safeError(sections.error)))
      setPageState('error')
      return
    }
    setSectionState(reviewStatus(sections.data, 'basic_profile'))
    setPageState('ready')
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])
  async function save(event: FormEvent) {
    event.preventDefault()
    const next = validateProfile(name, headline)
    setErrors(next)
    if (Object.keys(next).length || !userId || saving) return
    setSaving(true)
    const result = await profileRepository.update(
      userId,
      normalizeProfile(name, headline),
    )
    if (result.error) {
      setMessage(errorMessage(safeError(result.error)))
      setSaving(false)
      return
    }
    if (!result.data?.length) {
      setMessage(
        'Your profile no longer exists. Return to the overview and create it again.',
      )
      setPageState('missing')
      setSaving(false)
      return
    }
    setMessage('Saved. Review status was refreshed.')
    await load()
    setSaving(false)
  }
  async function review() {
    if (reviewing) return
    setReviewing(true)
    const result = await profileReviewRepository.review('basic_profile')
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else {
      setMessage('Basic profile reviewed. Review status was refreshed.')
      await load()
    }
    setReviewing(false)
  }
  if (pageState === 'loading')
    return (
      <section>
        <h2>Basic profile</h2>
        <p>Loading…</p>
      </section>
    )
  if (pageState === 'missing')
    return (
      <section>
        <h2>Basic profile</h2>
        <p role="alert">{message}</p>
        <Link to="/profile">Return to profile overview</Link>
      </section>
    )
  if (pageState === 'error')
    return (
      <section>
        <h2>Basic profile</h2>
        <p role="alert">{message ?? 'Profile could not be loaded.'}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )
  return (
    <section>
      <h2>Basic profile</h2>
      <p>
        Review status:{' '}
        {sectionState === 'current'
          ? 'Reviewed and current'
          : sectionState === 'stale'
            ? 'Stale — review again'
            : 'Not reviewed'}
      </p>
      {legacy && (
        <p>
          Previous degree-program information is available for reference.
          Confirm it by editing an education entry.
        </p>
      )}
      <form onSubmit={save}>
        {Object.keys(errors).length > 0 && (
          <div role="alert">
            <p>Please correct the fields below.</p>
          </div>
        )}
        <div>
          <label htmlFor="preferred-name">Preferred name</label>
          <input
            id="preferred-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={
              errors.preferred_name ? 'preferred-name-error' : undefined
            }
          />
          {errors.preferred_name && (
            <p id="preferred-name-error" role="alert">
              {errors.preferred_name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="headline">Headline</label>
          <input
            id="headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            aria-describedby={errors.headline ? 'headline-error' : undefined}
          />
          {errors.headline && (
            <p id="headline-error" role="alert">
              {errors.headline}
            </p>
          )}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
      <button
        type="button"
        className="secondary"
        disabled={reviewing}
        onClick={() => void review()}
      >
        {reviewing ? 'Saving review…' : 'Mark basic profile reviewed'}
      </button>
      {message && <p>{message}</p>}
    </section>
  )
}
