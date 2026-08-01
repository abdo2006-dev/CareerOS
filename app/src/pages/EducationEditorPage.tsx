import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import { normalizeEducation, validateEducation } from '../lib/profileValidation'

const empty = {
  institution: '',
  degree: '',
  field: '',
  degree_year: '',
  expected_graduation_month: '',
  expected_graduation_year: '',
  education_status: 'unknown',
  start_date: '',
  end_date: '',
}
export function EducationEditorPage() {
  const { educationId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [values, setValues] = useState<Record<string, string>>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<
    'loading' | 'loaded' | 'missing' | 'error'
  >(educationId ? 'loading' : 'loaded')
  const load = useCallback(async () => {
    if (!educationId) return
    const result = await educationRepository.get(educationId)
    if (result.error) {
      setLoadState(result.error.code === 'PGRST116' ? 'missing' : 'error')
      setMessage(
        result.error.code === 'PGRST116'
          ? 'This education entry no longer exists.'
          : 'This education entry could not be loaded.',
      )
      return
    }
    if (!result.data) {
      setLoadState('missing')
      setMessage('This education entry no longer exists.')
      return
    }
    const entry = result.data
    setValues({
      institution: entry.institution,
      degree: entry.degree ?? '',
      field: entry.field ?? '',
      degree_year: entry.degree_year?.toString() ?? '',
      expected_graduation_month:
        entry.expected_graduation_month?.toString() ?? '',
      expected_graduation_year:
        entry.expected_graduation_year?.toString() ?? '',
      education_status: entry.education_status,
      start_date: entry.start_date ?? '',
      end_date: entry.end_date ?? '',
    })
    setLoadState('loaded')
  }, [educationId])
  useEffect(() => {
    void load()
  }, [load])
  function field(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const next = validateEducation(values)
    setErrors(next)
    if (Object.keys(next).length || loadState !== 'loaded') return
    const input = normalizeEducation(values)
    const result = educationId
      ? await educationRepository.update(educationId, input)
      : await educationRepository.create(session!.user.id, input)
    if (result.error || !result.data) {
      setMessage(
        'Education could not be saved. Check the values and try again.',
      )
      return
    }
    navigate('/profile/education', { replace: true })
  }
  const input = (name: string, label: string, type = 'text') => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        value={values[name]}
        onChange={(event) => field(name, event.target.value)}
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
        <h2>Edit education</h2>
        <p>Loading…</p>
      </section>
    )
  if (loadState === 'missing' || loadState === 'error')
    return (
      <section>
        <h2>Edit education</h2>
        <p role="alert">{message}</p>
        <p>
          <Link to="/profile/education">Return to education</Link>
        </p>
      </section>
    )
  return (
    <section>
      <h2>{educationId ? 'Edit education' : 'Add education'}</h2>
      <form onSubmit={save}>
        {Object.keys(errors).length > 0 && (
          <div role="alert">Please correct the fields below.</div>
        )}
        {input('institution', 'Institution')}
        {input('degree', 'Degree')}
        {input('field', 'Field')}
        {input('degree_year', 'Degree year', 'number')}
        <fieldset>
          <legend>Education dates and status</legend>
          <div>
            <label htmlFor="education-status">Status</label>
            <select
              id="education-status"
              value={values.education_status}
              onChange={(event) =>
                field('education_status', event.target.value)
              }
            >
              {['unknown', 'current', 'completed', 'paused', 'withdrawn'].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </select>
          </div>
          {input('start_date', 'Start date', 'date')}
          {input('end_date', 'End date', 'date')}
          {input(
            'expected_graduation_month',
            'Expected graduation month',
            'number',
          )}
          {input(
            'expected_graduation_year',
            'Expected graduation year',
            'number',
          )}
          {errors.graduation && <p role="alert">{errors.graduation}</p>}
        </fieldset>
        <button type="submit">Save education</button>
      </form>
      {message && <p role="alert">{message}</p>}
      <p>
        <Link to="/profile/education">Cancel</Link>
      </p>
    </section>
  )
}
