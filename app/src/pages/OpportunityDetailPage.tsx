import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { opportunityRepository } from '../lib/opportunityRepository'
import { applicationRepository } from '../lib/applicationRepository'
import {
  employmentTypeLabels,
  opportunityKindLabels,
  remoteModeLabels,
  type OpportunitySearchRow,
  type UserOpportunityStateRow,
} from '../lib/opportunityTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

type SavedVersion = {
  id: string
  title: string
  organization: string
  description: string
  captured_at: string
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function OpportunityDetailPage() {
  const { opportunityId } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()

  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [row, setRow] = useState<OpportunitySearchRow | null>(null)
  const [state, setState] = useState<UserOpportunityStateRow | null>(null)
  const [savedVersion, setSavedVersion] = useState<SavedVersion | null>(null)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!opportunityId || !userId) return
    setStatus('loading')
    const result = await opportunityRepository.get(opportunityId)
    if (result.error) {
      setStatus('error')
      return
    }
    if (!result.data) {
      setStatus('missing')
      return
    }
    setRow(result.data)

    const [stateResult, appResult] = await Promise.all([
      opportunityRepository.getState(userId, opportunityId),
      applicationRepository.getByOpportunity(userId, opportunityId),
    ])
    if (stateResult.error) {
      setStatus('error')
      return
    }
    setState(stateResult.data)
    setApplicationId(appResult.data?.id ?? null)

    if (
      stateResult.data?.saved_opportunity_version_id &&
      stateResult.data.saved_opportunity_version_id !==
        result.data.opportunity_version_id
    ) {
      const versionResult = await opportunityRepository.getVersion(
        stateResult.data.saved_opportunity_version_id,
      )
      setSavedVersion(versionResult.data as SavedVersion | null)
    } else {
      setSavedVersion(null)
    }
    setStatus('ready')
  }, [opportunityId, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])

  async function toggleSave() {
    if (!userId || !row || pending) return
    setPending(true)
    const result = await opportunityRepository.setSaved(
      userId,
      row.opportunity_id,
      row.opportunity_version_id,
      !state?.saved_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPending(false)
  }

  async function toggleHide() {
    if (!userId || !row || pending) return
    setPending(true)
    const result = await opportunityRepository.setHidden(
      userId,
      row.opportunity_id,
      !state?.hidden_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPending(false)
  }

  async function startApplication() {
    if (!userId || !row || pending) return
    setPending(true)
    const result = await applicationRepository.createForOpportunity(
      userId,
      row.opportunity_version_id,
    )
    if (result.error) {
      if (result.error.code === '23505') {
        const existing = await applicationRepository.getByOpportunity(
          userId,
          row.opportunity_id,
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
      <section>
        <h2>Opportunity</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'missing')
    return (
      <section>
        <h2>Opportunity</h2>
        <p role="alert">This opportunity no longer exists.</p>
        <Link to="/opportunities">Return to opportunities</Link>
      </section>
    )
  if (status === 'error' || !row)
    return (
      <section>
        <h2>Opportunity</h2>
        <p role="alert">This opportunity could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )

  return (
    <section className="page opportunity-detail-page">
      <h2>{row.title}</h2>
      <p>
        {row.organization} · {row.source_display_name}
      </p>
      <p>
        {opportunityKindLabels[row.opportunity_kind]} ·{' '}
        {employmentTypeLabels[row.employment_type]} ·{' '}
        {remoteModeLabels[row.remote_mode]}
      </p>
      {row.location_text && <p>{row.location_text}</p>}
      {row.posted_at && <p>Posted {formatDate(row.posted_at)}</p>}
      {row.application_deadline && (
        <p>Deadline {formatDate(row.application_deadline)}</p>
      )}
      <p>
        First discovered {formatDate(row.first_discovered_at)} · Last checked{' '}
        {formatDate(row.last_checked_at)} · Status: {row.lifecycle_status}
      </p>
      <section>
        <h3>Description</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{row.description}</p>
      </section>

      {savedVersion && (
        <section>
          <p role="alert">
            The source listing has changed since you saved it. Showing both
            versions below.
          </p>
          <h3>Version you saved ({formatDate(savedVersion.captured_at)})</h3>
          <p>
            <strong>{savedVersion.title}</strong> at {savedVersion.organization}
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{savedVersion.description}</p>
        </section>
      )}

      <p>
        <a
          href={row.canonical_source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original source listing
        </a>
      </p>
      {row.application_url && (
        <p>
          <a
            href={row.application_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open application page
          </a>
        </p>
      )}

      {message && <p role="alert">{message}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => void toggleSave()}
      >
        {state?.saved_at ? 'Unsave' : 'Save'}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={() => void toggleHide()}
      >
        {state?.hidden_at ? 'Unhide' : 'Hide'}
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
