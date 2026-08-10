import { Link, useNavigate } from 'react-router'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { privateOpportunityRepository } from '../lib/privateOpportunityRepository'
import {
  employmentTypeLabels,
  employmentTypeOptions,
  opportunityKindLabels,
  opportunityKindOptions,
  remoteModeLabels,
  remoteModeOptions,
  type EmploymentType,
  type OpportunityKind,
  type RemoteMode,
} from '../lib/opportunityTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

const empty = {
  source_url: '',
  title: '',
  organization_name: '',
  location_text: '',
  opportunity_kind: 'other' as OpportunityKind,
  employment_type: 'other' as EmploymentType,
  remote_mode: 'unknown' as RemoteMode,
  description_text: '',
  posted_at: '',
  application_deadline: '',
  application_url: '',
}

function validate(values: typeof empty) {
  const errors: Record<string, string> = {}
  if (!values.source_url.trim().startsWith('https://'))
    errors.source_url = 'Enter the https:// URL where you found this listing.'
  if (!values.title.trim()) errors.title = 'Title is required.'
  if (!values.organization_name.trim())
    errors.organization_name = 'Organization is required.'
  if (!values.location_text.trim())
    errors.location_text = 'Location is required.'
  if (values.application_url && !values.application_url.startsWith('https://'))
    errors.application_url = 'Application URL must start with https://.'
  return errors
}

export function ManualOpportunityFormPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function field<K extends keyof typeof empty>(name: K, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || saving || !session) return
    setSaving(true)
    const result = await privateOpportunityRepository.create(session.user.id, {
      source_url: values.source_url.trim(),
      title: values.title.trim(),
      organization_name: values.organization_name.trim(),
      location_text: values.location_text.trim(),
      opportunity_kind: values.opportunity_kind,
      employment_type: values.employment_type,
      remote_mode: values.remote_mode,
      description_text: values.description_text.trim() || null,
      posted_at: values.posted_at || null,
      application_deadline: values.application_deadline || null,
      application_url: values.application_url.trim() || null,
    })
    if (result.error || !result.data) {
      setMessage(errorMessage(safeError(result.error)))
      setSaving(false)
      return
    }
    navigate(`/opportunities/manual/${result.data.id}`, { replace: true })
  }

  return (
    <section className="page manual-entry-page">
      <h2>Add an opportunity manually</h2>
      <p>
        Use this for a posting from a source CareerOS doesn't automatically
        import. You confirm the details yourself — nothing is fetched
        automatically.
      </p>
      <form onSubmit={save} noValidate>
        <div>
          <label htmlFor="source_url">Original URL (https://)</label>
          <input
            id="source_url"
            type="url"
            value={values.source_url}
            onChange={(event) => field('source_url', event.target.value)}
            aria-invalid={Boolean(errors.source_url)}
          />
          {errors.source_url && <p role="alert">{errors.source_url}</p>}
        </div>
        <div>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={values.title}
            onChange={(event) => field('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p role="alert">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor="organization_name">Organization</label>
          <input
            id="organization_name"
            value={values.organization_name}
            onChange={(event) => field('organization_name', event.target.value)}
            aria-invalid={Boolean(errors.organization_name)}
          />
          {errors.organization_name && (
            <p role="alert">{errors.organization_name}</p>
          )}
        </div>
        <div>
          <label htmlFor="location_text">Location</label>
          <input
            id="location_text"
            value={values.location_text}
            onChange={(event) => field('location_text', event.target.value)}
            aria-invalid={Boolean(errors.location_text)}
          />
          {errors.location_text && <p role="alert">{errors.location_text}</p>}
        </div>
        <div>
          <label htmlFor="opportunity_kind">Kind</label>
          <select
            id="opportunity_kind"
            value={values.opportunity_kind}
            onChange={(event) => field('opportunity_kind', event.target.value)}
          >
            {opportunityKindOptions.map((value) => (
              <option key={value} value={value}>
                {opportunityKindLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="employment_type">Employment type</label>
          <select
            id="employment_type"
            value={values.employment_type}
            onChange={(event) => field('employment_type', event.target.value)}
          >
            {employmentTypeOptions.map((value) => (
              <option key={value} value={value}>
                {employmentTypeLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="remote_mode">Remote mode</label>
          <select
            id="remote_mode"
            value={values.remote_mode}
            onChange={(event) => field('remote_mode', event.target.value)}
          >
            {remoteModeOptions.map((value) => (
              <option key={value} value={value}>
                {remoteModeLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="description_text">Description / requirements</label>
          <textarea
            id="description_text"
            value={values.description_text}
            onChange={(event) => field('description_text', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="posted_at">Posted date (if known)</label>
          <input
            id="posted_at"
            type="date"
            value={values.posted_at}
            onChange={(event) => field('posted_at', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="application_deadline">Deadline (if known)</label>
          <input
            id="application_deadline"
            type="date"
            value={values.application_deadline}
            onChange={(event) =>
              field('application_deadline', event.target.value)
            }
          />
        </div>
        <div>
          <label htmlFor="application_url">
            Application URL (if different from the original URL)
          </label>
          <input
            id="application_url"
            type="url"
            value={values.application_url}
            onChange={(event) => field('application_url', event.target.value)}
            aria-invalid={Boolean(errors.application_url)}
          />
          {errors.application_url && (
            <p role="alert">{errors.application_url}</p>
          )}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add opportunity'}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
      <p>
        <Link to="/opportunities">Cancel</Link>
      </p>
    </section>
  )
}
