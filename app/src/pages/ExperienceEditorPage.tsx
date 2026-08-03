import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { experienceRepository } from '../lib/experienceRepository'
import {
  normalizeExperience,
  validateExperience,
} from '../lib/profileValidation'
import { errorMessage, safeError } from '../lib/profileTypes'

const empty = {
  experience_kind: 'employment',
  organization: '',
  role: '',
  location: '',
  start_year: '',
  start_month: '',
  end_year: '',
  end_month: '',
  is_current: 'false',
  description: '',
}

const kinds = [
  ['employment', 'Employment'],
  ['internship', 'Internship'],
  ['research', 'Research'],
  ['volunteering', 'Volunteering'],
  ['student_leadership', 'Student organization or leadership'],
  ['other', 'Other'],
]

export function ExperienceEditorPage() {
  const { experienceId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [values, setValues] = useState<Record<string, string>>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadState, setLoadState] = useState<
    'loading' | 'loaded' | 'missing' | 'error'
  >(experienceId ? 'loading' : 'loaded')

  const load = useCallback(async () => {
    if (!experienceId) return
    const result = await experienceRepository.get(experienceId)
    if (result.error) {
      const kind = safeError(result.error)
      setLoadState(kind === 'missing' ? 'missing' : 'error')
      setMessage(
        kind === 'missing'
          ? 'This experience entry no longer exists.'
          : errorMessage(kind),
      )
      return
    }
    if (!result.data) {
      setLoadState('missing')
      setMessage('This experience entry no longer exists.')
      return
    }
    const entry = result.data
    setValues({
      experience_kind: entry.experience_kind,
      organization: entry.organization,
      role: entry.role,
      location: entry.location ?? '',
      start_year: entry.start_year.toString(),
      start_month: entry.start_month?.toString() ?? '',
      end_year: entry.end_year?.toString() ?? '',
      end_month: entry.end_month?.toString() ?? '',
      is_current: entry.is_current ? 'true' : 'false',
      description: entry.description ?? '',
    })
    setLoadState('loaded')
  }, [experienceId])

  useEffect(() => {
    void load()
  }, [load])

  function field(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function setCurrent(isCurrent: boolean) {
    setValues((current) => ({
      ...current,
      is_current: isCurrent ? 'true' : 'false',
      end_year: isCurrent ? '' : current.end_year,
      end_month: isCurrent ? '' : current.end_month,
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const next = validateExperience(values)
    setErrors(next)
    if (Object.keys(next).length || loadState !== 'loaded' || saving) return
    setSaving(true)
    const input = normalizeExperience(values)
    const result = experienceId
      ? await experienceRepository.update(experienceId, input)
      : await experienceRepository.create(session!.user.id, input)
    if (result.error) {
      setMessage(errorMessage(safeError(result.error)))
      setSaving(false)
      return
    }
    if (!result.data) {
      setMessage(
        'This experience entry no longer exists. Return to experience.',
      )
      setLoadState('missing')
      setSaving(false)
      return
    }
    navigate('/profile/experience', { replace: true })
  }

  const input = (
    name: string,
    label: string,
    type = 'text',
    disabled = false,
  ) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        value={values[name]}
        disabled={disabled}
        onChange={(event) => field(name, event.target.value)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`${name}-error`} role="alert">
          {errors[name]}
        </p>
      )}
    </div>
  )

  if (loadState === 'loading')
    return (
      <section>
        <h2>Edit experience</h2>
        <p>Loading…</p>
      </section>
    )
  if (loadState === 'missing' || loadState === 'error')
    return (
      <section>
        <h2>Edit experience</h2>
        <p role="alert">{message}</p>
        <p>
          <Link to="/profile/experience">Return to experience</Link>
        </p>
        {loadState === 'error' && (
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        )}
      </section>
    )

  const current = values.is_current === 'true'
  const summaryFields = Object.keys(errors).map((name) =>
    name === 'end_period' ? 'experience-period' : name,
  )
  return (
    <section>
      <h2>{experienceId ? 'Edit experience' : 'Add experience'}</h2>
      <form onSubmit={save} noValidate>
        {summaryFields.length > 0 && (
          <div role="alert">
            <p>Please correct the fields below.</p>
            <ul>
              {summaryFields.map((name) => (
                <li key={name}>
                  <a href={`#${name}`}>{errors[name] ?? errors.end_period}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label htmlFor="experience_kind">Experience kind</label>
          <select
            id="experience_kind"
            value={values.experience_kind}
            onChange={(event) => field('experience_kind', event.target.value)}
            aria-invalid={Boolean(errors.experience_kind)}
            aria-describedby={
              errors.experience_kind ? 'experience_kind-error' : undefined
            }
          >
            {kinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.experience_kind && (
            <p id="experience_kind-error" role="alert">
              {errors.experience_kind}
            </p>
          )}
        </div>
        {input('organization', 'Organization')}
        {input('role', 'Role')}
        {input('location', 'Location')}
        <fieldset id="experience-period">
          <legend>Experience period</legend>
          {input('start_year', 'Start year', 'number')}
          {input('start_month', 'Start month (optional)', 'number')}
          <div>
            <label htmlFor="is_current">
              <input
                id="is_current"
                type="checkbox"
                checked={current}
                onChange={(event) => setCurrent(event.target.checked)}
              />{' '}
              This experience is current
            </label>
          </div>
          {input('end_year', 'End year (optional)', 'number', current)}
          <div>
            <label htmlFor="end_month">End month (optional)</label>
            <input
              id="end_month"
              type="number"
              value={values.end_month}
              disabled={current}
              onChange={(event) => field('end_month', event.target.value)}
              aria-invalid={Boolean(errors.end_month)}
              aria-describedby={
                errors.end_month ? 'end_month-error' : undefined
              }
            />
            {errors.end_month && (
              <p id="end_month-error" role="alert">
                {errors.end_month}
              </p>
            )}
          </div>
          {errors.end_period && <p role="alert">{errors.end_period}</p>}
        </fieldset>
        <div>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={values.description}
            onChange={(event) => field('description', event.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? 'description-error' : undefined
            }
          />
          {errors.description && (
            <p id="description-error" role="alert">
              {errors.description}
            </p>
          )}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save experience'}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
      <p>
        <Link to="/profile/experience">Cancel</Link>
      </p>
    </section>
  )
}
