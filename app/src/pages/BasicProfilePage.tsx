import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { profileRepository } from '../lib/profileRepository'
import { profileReviewRepository } from '../lib/profileReviewRepository'
import { normalizeProfile, validateProfile } from '../lib/profileValidation'

export function BasicProfilePage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [legacy, setLegacy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await profileRepository.get(userId)
    if (data) {
      setName(data.preferred_name ?? '')
      setHeadline(data.headline ?? '')
      setLegacy(data.degree_program)
    }
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])
  async function save(event: FormEvent) {
    event.preventDefault()
    const next = validateProfile(name, headline)
    setErrors(next)
    if (Object.keys(next).length || !userId) return
    const result = await profileRepository.update(
      userId,
      normalizeProfile(name, headline),
    )
    setMessage(result.error ? 'Profile could not be saved.' : 'Saved.')
  }
  async function review() {
    const result = await profileReviewRepository.review('basic_profile')
    setMessage(
      result.error ? 'Review could not be saved.' : 'Basic profile reviewed.',
    )
  }
  return (
    <section>
      <h2>Basic profile</h2>
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
        <button type="submit">Save</button>
      </form>
      <button type="button" className="secondary" onClick={() => void review()}>
        Mark basic profile reviewed
      </button>
      {message && <p>{message}</p>}
    </section>
  )
}
