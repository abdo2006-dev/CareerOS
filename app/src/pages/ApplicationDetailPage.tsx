import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { applicationRepository } from '../lib/applicationRepository'
import { opportunityRepository } from '../lib/opportunityRepository'
import { interviewPrepRepository } from '../lib/interviewPrepRepository'
import {
  applicationStatusLabels,
  applicationStatusOptions,
  type Application,
  type ApplicationStatus,
  type InterviewPrepNotes,
} from '../lib/opportunityTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

type PinnedListing = {
  title: string
  organization: string
  description: string
  applicationUrl: string | null
  sourceUrl?: string
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function ApplicationDetailPage() {
  const { applicationId } = useParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [application, setApplication] = useState<Application | null>(null)
  const [pinned, setPinned] = useState<PinnedListing | null>(null)
  const [opportunityId, setOpportunityId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [nextAction, setNextAction] = useState('')
  const [nextActionDueAt, setNextActionDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [contactNote, setContactNote] = useState('')

  const [prep, setPrep] = useState<InterviewPrepNotes | null>(null)
  const [prepValues, setPrepValues] = useState({
    responsibilities_to_discuss: '',
    required_technologies: '',
    topics_to_revise: '',
    likely_questions: '',
    questions_to_ask: '',
    interview_date: '',
    interview_format: '',
    reflections: '',
  })
  const [prepSaving, setPrepSaving] = useState(false)

  const load = useCallback(async () => {
    if (!applicationId) return
    setStatus('loading')
    const result = await applicationRepository.get(applicationId)
    if (result.error) {
      setStatus('error')
      return
    }
    if (!result.data) {
      setStatus('missing')
      return
    }
    const app = result.data
    setApplication(app)
    setNextAction(app.next_action ?? '')
    setNextActionDueAt(toDateInput(app.next_action_due_at))
    setNotes(app.notes ?? '')
    setContactNote(app.contact_note ?? '')

    if (app.opportunity_version_id) {
      const versionResult = await opportunityRepository.getVersion(
        app.opportunity_version_id,
      )
      if (versionResult.data) {
        setOpportunityId(versionResult.data.opportunity_id as string)
        setPinned({
          title: versionResult.data.title as string,
          organization: versionResult.data.organization as string,
          description: versionResult.data.description as string,
          applicationUrl: versionResult.data.application_url as string | null,
        })
      }
    } else if (app.private_opportunity_snapshot) {
      const snapshot = app.private_opportunity_snapshot
      setPinned({
        title: (snapshot.title as string) ?? 'Manual opportunity',
        organization: (snapshot.organization_name as string) ?? '',
        description: (snapshot.description_text as string) ?? '',
        applicationUrl: (snapshot.application_url as string | null) ?? null,
        sourceUrl: (snapshot.source_url as string | undefined) ?? undefined,
      })
    }

    const prepResult = await interviewPrepRepository.get(applicationId)
    if (!prepResult.error && prepResult.data) {
      setPrep(prepResult.data)
      setPrepValues({
        responsibilities_to_discuss:
          prepResult.data.responsibilities_to_discuss ?? '',
        required_technologies: prepResult.data.required_technologies ?? '',
        topics_to_revise: prepResult.data.topics_to_revise ?? '',
        likely_questions: prepResult.data.likely_questions ?? '',
        questions_to_ask: prepResult.data.questions_to_ask ?? '',
        interview_date: toDateInput(prepResult.data.interview_date),
        interview_format: prepResult.data.interview_format ?? '',
        reflections: prepResult.data.reflections ?? '',
      })
    }
    setStatus('ready')
  }, [applicationId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])

  async function changeStatus(next: ApplicationStatus) {
    if (!application || pending) return
    setPending(true)
    const result = await applicationRepository.updateStatus(
      application.id,
      next,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPending(false)
  }

  async function saveFields(event: FormEvent) {
    event.preventDefault()
    if (!application || pending) return
    setPending(true)
    const result = await applicationRepository.updateFields(application.id, {
      next_action: nextAction.trim() || null,
      next_action_due_at: nextActionDueAt || null,
      notes: notes.trim() || null,
      contact_note: contactNote.trim() || null,
    })
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else {
      setApplication(result.data)
      setMessage('Saved.')
    }
    setPending(false)
  }

  async function savePrep(event: FormEvent) {
    event.preventDefault()
    if (!applicationId || prepSaving) return
    setPrepSaving(true)
    const result = await interviewPrepRepository.upsert(applicationId, {
      responsibilities_to_discuss:
        prepValues.responsibilities_to_discuss.trim() || null,
      required_technologies: prepValues.required_technologies.trim() || null,
      topics_to_revise: prepValues.topics_to_revise.trim() || null,
      likely_questions: prepValues.likely_questions.trim() || null,
      questions_to_ask: prepValues.questions_to_ask.trim() || null,
      interview_date: prepValues.interview_date || null,
      interview_format: prepValues.interview_format.trim() || null,
      reflections: prepValues.reflections.trim() || null,
    })
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else {
      setPrep(result.data)
      setMessage('Interview prep notes saved.')
    }
    setPrepSaving(false)
  }

  async function remove() {
    if (!application || pending) return
    if (
      !window.confirm(
        'Delete this application? This also deletes its interview-preparation notes.',
      )
    )
      return
    setPending(true)
    const result = await applicationRepository.remove(application.id)
    if (result.error) {
      setMessage(errorMessage(safeError(result.error)))
      setPending(false)
      return
    }
    navigate('/applications', { replace: true })
  }

  if (status === 'loading')
    return (
      <section>
        <h2>Application</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'missing')
    return (
      <section>
        <h2>Application</h2>
        <p role="alert">This application no longer exists.</p>
        <Link to="/applications">Return to applications</Link>
      </section>
    )
  if (status === 'error' || !application)
    return (
      <section>
        <h2>Application</h2>
        <p role="alert">This application could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )

  return (
    <section className="page application-detail-page">
      <h2>{pinned?.title ?? 'Application'}</h2>
      {pinned && <p>{pinned.organization}</p>}
      {message && <p role="alert">{message}</p>}

      <div>
        <label htmlFor="application-status">Status</label>
        <select
          id="application-status"
          value={application.status}
          disabled={pending}
          onChange={(event) =>
            void changeStatus(event.target.value as ApplicationStatus)
          }
        >
          {applicationStatusOptions.map((value) => (
            <option key={value} value={value}>
              {applicationStatusLabels[value]}
            </option>
          ))}
        </select>
      </div>
      <p>
        Status updated {formatDate(application.status_updated_at)}
        {application.applied_at && (
          <> · Applied {formatDate(application.applied_at)}</>
        )}
      </p>

      <form onSubmit={saveFields}>
        <div>
          <label htmlFor="next_action">Next action</label>
          <input
            id="next_action"
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="next_action_due_at">Next action due</label>
          <input
            id="next_action_due_at"
            type="date"
            value={nextActionDueAt}
            onChange={(event) => setNextActionDueAt(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="contact_note">Recruiter / contact notes</label>
          <textarea
            id="contact_note"
            value={contactNote}
            onChange={(event) => setContactNote(event.target.value)}
          />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>

      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={() => void remove()}
      >
        Delete application
      </button>

      {opportunityId && (
        <p>
          <Link to={`/opportunities/${opportunityId}`}>
            Open the current opportunity page
          </Link>{' '}
          (shows the latest listing content, not necessarily what you applied to
          — see the pinned snapshot below)
        </p>
      )}
      {pinned?.applicationUrl && (
        <p>
          <a
            href={pinned.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the authoritative external application page
          </a>
        </p>
      )}
      {pinned?.sourceUrl && (
        <p>
          <a href={pinned.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open the original source listing
          </a>
        </p>
      )}

      {pinned && (
        <section>
          <h3>Pinned listing snapshot</h3>
          <p>
            The exact content saved at application time — later changes to the
            source listing never alter this.
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{pinned.description}</p>
        </section>
      )}

      <section>
        <h3>Interview preparation</h3>
        <form onSubmit={savePrep}>
          <div>
            <label htmlFor="responsibilities_to_discuss">
              Responsibilities to discuss
            </label>
            <textarea
              id="responsibilities_to_discuss"
              value={prepValues.responsibilities_to_discuss}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  responsibilities_to_discuss: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="required_technologies">Required technologies</label>
            <textarea
              id="required_technologies"
              value={prepValues.required_technologies}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  required_technologies: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="topics_to_revise">Topics to revise</label>
            <textarea
              id="topics_to_revise"
              value={prepValues.topics_to_revise}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  topics_to_revise: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="likely_questions">Likely interview questions</label>
            <textarea
              id="likely_questions"
              value={prepValues.likely_questions}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  likely_questions: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="questions_to_ask">
              Questions to ask the employer
            </label>
            <textarea
              id="questions_to_ask"
              value={prepValues.questions_to_ask}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  questions_to_ask: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="interview_date">Interview date</label>
            <input
              id="interview_date"
              type="date"
              value={prepValues.interview_date}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  interview_date: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="interview_format">Interview format</label>
            <input
              id="interview_format"
              value={prepValues.interview_format}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  interview_format: event.target.value,
                }))
              }
              placeholder="e.g. on-site, phone, video"
            />
          </div>
          <div>
            <label htmlFor="reflections">Post-interview reflections</label>
            <textarea
              id="reflections"
              value={prepValues.reflections}
              onChange={(event) =>
                setPrepValues((current) => ({
                  ...current,
                  reflections: event.target.value,
                }))
              }
            />
          </div>
          <button type="submit" disabled={prepSaving}>
            {prepSaving
              ? 'Saving…'
              : prep
                ? 'Update interview prep'
                : 'Save interview prep'}
          </button>
        </form>
      </section>

      <p>
        <Link to="/applications">Back to applications</Link>
      </p>
    </section>
  )
}
