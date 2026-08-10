import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { privateOpportunityRepository } from '../lib/privateOpportunityRepository'
import { applicationRepository } from '../lib/applicationRepository'
import {
  employmentTypeLabels,
  employmentTypeOptions,
  opportunityKindLabels,
  opportunityKindOptions,
  remoteModeLabels,
  remoteModeOptions,
  type EmploymentType,
  type OpportunityKind,
  type PrivateOpportunity,
  type RemoteMode,
} from '../lib/opportunityTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

type FormValues = {
  source_url: string
  title: string
  organization_name: string
  location_text: string
  opportunity_kind: OpportunityKind
  employment_type: EmploymentType
  remote_mode: RemoteMode
  description_text: string
  posted_at: string
  application_deadline: string
  application_url: string
}

function toFormValues(entry: PrivateOpportunity): FormValues {
  return {
    source_url: entry.source_url,
    title: entry.title,
    organization_name: entry.organization_name,
    location_text: entry.location_text,
    opportunity_kind: entry.opportunity_kind,
    employment_type: entry.employment_type,
    remote_mode: entry.remote_mode,
    description_text: entry.description_text ?? '',
    posted_at: entry.posted_at?.slice(0, 10) ?? '',
    application_deadline: entry.application_deadline?.slice(0, 10) ?? '',
    application_url: entry.application_url ?? '',
  }
}

export function PrivateOpportunityDetailPage() {
  const { privateOpportunityId } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()

  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [entry, setEntry] = useState<PrivateOpportunity | null>(null)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<FormValues | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!privateOpportunityId || !userId) return
    setStatus('loading')
    const result = await privateOpportunityRepository.get(privateOpportunityId)
    if (result.error) {
      setStatus('error')
      return
    }
    if (!result.data) {
      setStatus('missing')
      return
    }
    setEntry(result.data)
    setValues(toFormValues(result.data))
    const appResult = await applicationRepository.getByPrivateOpportunity(
      userId,
      privateOpportunityId,
    )
    setApplicationId(appResult.data?.id ?? null)
    setStatus('ready')
  }, [privateOpportunityId, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])

  function field<K extends keyof FormValues>(name: K, value: string) {
    setValues((current) => (current ? { ...current, [name]: value } : current))
  }

  function validate(current: FormValues) {
    const nextErrors: Record<string, string> = {}
    if (!current.source_url.trim())
      nextErrors.source_url = 'Source URL is required.'
    else if (!current.source_url.startsWith('https://'))
      nextErrors.source_url = 'Source URL must start with https://.'
    if (!current.title.trim()) nextErrors.title = 'Title is required.'
    if (!current.organization_name.trim())
      nextErrors.organization_name = 'Organization is required.'
    if (!current.location_text.trim())
      nextErrors.location_text = 'Location is required.'
    if (
      current.application_url &&
      !current.application_url.startsWith('https://')
    )
      nextErrors.application_url = 'Application URL must start with https://.'
    return nextErrors
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!entry || !values) return
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || pending) return
    setPending(true)
    const result = await privateOpportunityRepository.update(entry.id, {
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
      setPending(false)
      return
    }
    setEntry(result.data)
    setValues(toFormValues(result.data))
    setEditing(false)
    setPending(false)
    setMessage('Saved.')
  }

  async function toggleDismiss() {
    if (!entry || pending) return
    setPending(true)
    const result = await privateOpportunityRepository.setDismissed(
      entry.id,
      !entry.dismissed_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPending(false)
  }

  async function remove() {
    if (!entry || pending) return
    if (
      !window.confirm(
        'Delete this manual opportunity? This does not delete any existing application for it -- the application keeps its own pinned snapshot.',
      )
    )
      return
    setPending(true)
    const result = await privateOpportunityRepository.remove(entry.id)
    if (result.error) {
      setMessage(errorMessage(safeError(result.error)))
      setPending(false)
      return
    }
    navigate('/opportunities', { replace: true })
  }

  async function startApplication() {
    if (!entry || !userId || pending) return
    setPending(true)
    const result = await applicationRepository.createForPrivateOpportunity(
      userId,
      entry.id,
    )
    if (result.error) {
      if (result.error.code === '23505') {
        const existing = await applicationRepository.getByPrivateOpportunity(
          userId,
          entry.id,
        )
        if (existing.data) {
          navigate(`/applications/${existing.data.id}`)
          return
        }
      }
      setMessage(errorMessage(safeError(result.error)))
      setPending(false)
      return
    }
    navigate(`/applications/${result.data!.id}`)
  }

  if (status === 'loading')
    return (
      <section className="page manual-entry-page">
        <h2>Manual opportunity</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'missing')
    return (
      <section className="page manual-entry-page">
        <h2>Manual opportunity</h2>
        <p role="alert">This opportunity no longer exists.</p>
        <Link to="/opportunities">Return to opportunities</Link>
      </section>
    )
  if (status === 'error' || !entry || !values)
    return (
      <section className="page manual-entry-page">
        <h2>Manual opportunity</h2>
        <p role="alert">This opportunity could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )

  if (editing)
    return (
      <section className="page manual-entry-page">
        <h2>Edit manual opportunity</h2>
        <form onSubmit={save} noValidate>
          <div>
            <label htmlFor="edit_source_url">Source URL</label>
            <input
              id="edit_source_url"
              type="url"
              value={values.source_url}
              onChange={(event) => field('source_url', event.target.value)}
              aria-invalid={Boolean(errors.source_url)}
            />
            {errors.source_url && <p role="alert">{errors.source_url}</p>}
            <p>
              Correcting this never changes an already-captured application
              snapshot -- that stays exactly as it was when you applied.
            </p>
          </div>
          <div>
            <label htmlFor="edit_title">Title</label>
            <input
              id="edit_title"
              value={values.title}
              onChange={(event) => field('title', event.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <p role="alert">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="edit_organization_name">Organization</label>
            <input
              id="edit_organization_name"
              value={values.organization_name}
              onChange={(event) =>
                field('organization_name', event.target.value)
              }
              aria-invalid={Boolean(errors.organization_name)}
            />
            {errors.organization_name && (
              <p role="alert">{errors.organization_name}</p>
            )}
          </div>
          <div>
            <label htmlFor="edit_location_text">Location</label>
            <input
              id="edit_location_text"
              value={values.location_text}
              onChange={(event) => field('location_text', event.target.value)}
              aria-invalid={Boolean(errors.location_text)}
            />
            {errors.location_text && <p role="alert">{errors.location_text}</p>}
          </div>
          <div>
            <label htmlFor="edit_opportunity_kind">Kind</label>
            <select
              id="edit_opportunity_kind"
              value={values.opportunity_kind}
              onChange={(event) =>
                field('opportunity_kind', event.target.value)
              }
            >
              {opportunityKindOptions.map((value) => (
                <option key={value} value={value}>
                  {opportunityKindLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit_employment_type">Employment type</label>
            <select
              id="edit_employment_type"
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
            <label htmlFor="edit_remote_mode">Remote mode</label>
            <select
              id="edit_remote_mode"
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
            <label htmlFor="edit_description_text">
              Description / requirements
            </label>
            <textarea
              id="edit_description_text"
              value={values.description_text}
              onChange={(event) =>
                field('description_text', event.target.value)
              }
            />
          </div>
          <div>
            <label htmlFor="edit_posted_at">Posted date (if known)</label>
            <input
              id="edit_posted_at"
              type="date"
              value={values.posted_at}
              onChange={(event) => field('posted_at', event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="edit_application_deadline">
              Deadline (if known)
            </label>
            <input
              id="edit_application_deadline"
              type="date"
              value={values.application_deadline}
              onChange={(event) =>
                field('application_deadline', event.target.value)
              }
            />
          </div>
          <div>
            <label htmlFor="edit_application_url">Application URL</label>
            <input
              id="edit_application_url"
              type="url"
              value={values.application_url}
              onChange={(event) => field('application_url', event.target.value)}
              aria-invalid={Boolean(errors.application_url)}
            />
            {errors.application_url && (
              <p role="alert">{errors.application_url}</p>
            )}
          </div>
          <button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setValues(toFormValues(entry))
              setErrors({})
              setEditing(false)
            }}
          >
            Cancel
          </button>
        </form>
        {message && <p role="alert">{message}</p>}
      </section>
    )

  return (
    <section className="page manual-entry-page">
      <h2>{entry.title}</h2>
      <p>Added by you</p>
      <p>
        {entry.organization_name} ·{' '}
        {opportunityKindLabels[entry.opportunity_kind]} ·{' '}
        {employmentTypeLabels[entry.employment_type]} ·{' '}
        {remoteModeLabels[entry.remote_mode]}
      </p>
      <p>{entry.location_text}</p>
      {entry.description_text && (
        <section>
          <h3>Description</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{entry.description_text}</p>
        </section>
      )}
      <p>
        <a href={entry.source_url} target="_blank" rel="noopener noreferrer">
          Open original source listing
        </a>
      </p>
      {entry.application_url && (
        <p>
          <a
            href={entry.application_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open application page
          </a>
        </p>
      )}
      {message && <p role="alert">{message}</p>}
      <button type="button" onClick={() => setEditing(true)}>
        Edit
      </button>
      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={() => void toggleDismiss()}
      >
        {entry.dismissed_at ? 'Unhide' : 'Hide'}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={() => void remove()}
      >
        Delete
      </button>
      {applicationId ? (
        <Link to={`/applications/${applicationId}`}>View application</Link>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => void startApplication()}
        >
          Start application
        </button>
      )}
      <p>
        <Link to="/opportunities">Back to opportunities</Link>
      </p>
    </section>
  )
}
