import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { experienceRepository } from '../lib/experienceRepository'
import {
  profileReviewRepository,
  reviewStatus,
} from '../lib/profileReviewRepository'
import {
  errorMessage,
  safeError,
  type WorkExperience,
} from '../lib/profileTypes'

const kindLabels: Record<WorkExperience['experience_kind'], string> = {
  employment: 'Employment',
  internship: 'Internship',
  research: 'Research',
  volunteering: 'Volunteering',
  student_leadership: 'Student organization or leadership',
  other: 'Other',
}

function periodPart(year: number, month: number | null) {
  if (!month) return String(year)
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function experiencePeriod(entry: WorkExperience) {
  const start = periodPart(entry.start_year, entry.start_month)
  if (entry.is_current) return `${start} — Present`
  if (!entry.end_year) return `${start} — End date not recorded`
  return `${start} — ${periodPart(entry.end_year, entry.end_month)}`
}

export function ExperienceListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [entries, setEntries] = useState<WorkExperience[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pendingOperation, setPendingOperation] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sectionState, setSectionState] = useState<
    'current' | 'stale' | 'not_reviewed'
  >('not_reviewed')

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const result = await experienceRepository.list(userId)
    if (result.error) return setStatus('error')
    const sections = await profileReviewRepository.state(userId)
    if (sections.error) return setStatus('error')
    setEntries(result.data)
    setSectionState(reviewStatus(sections.data, 'experience'))
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])

  async function remove(id: string) {
    if (pendingOperation) return
    setPendingOperation(`delete:${id}`)
    const result = await experienceRepository.remove(id)
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else if (!result.data?.length)
      setMessage(
        'This experience could not be deleted. It may already be gone.',
      )
    else {
      setMessage('Experience deleted.')
      await load()
    }
    setDeleting(null)
    setPendingOperation(null)
  }

  async function review() {
    if (reviewing) return
    setReviewing(true)
    const result = await profileReviewRepository.review('experience')
    setMessage(
      result.error
        ? errorMessage(safeError(result.error))
        : 'Experience reviewed. Review status was refreshed.',
    )
    if (!result.error) await load()
    setReviewing(false)
  }

  if (status === 'loading')
    return (
      <section>
        <h2>Experience and research</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'error')
    return (
      <section>
        <h2>Experience and research</h2>
        <p role="alert">Experience could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )
  return (
    <section>
      <h2>Experience and research</h2>
      <p>
        Review status:{' '}
        {sectionState === 'current'
          ? 'Reviewed and current'
          : sectionState === 'stale'
            ? 'Stale — review again'
            : 'Not reviewed'}
      </p>
      <p>
        <Link to="new">Add experience</Link>
      </p>
      {entries.length === 0 ? (
        <p>No experience entries yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.role}</strong> at {entry.organization}
              <br />
              <span>{kindLabels[entry.experience_kind]}</span>
              <br />
              <span>{experiencePeriod(entry)}</span>
              {entry.location && (
                <>
                  <br />
                  <span>{entry.location}</span>
                </>
              )}
              <br />
              <Link to={`${entry.id}/edit`}>Edit</Link>
              <button
                type="button"
                className="secondary"
                disabled={Boolean(pendingOperation)}
                onClick={() => setDeleting(entry.id)}
              >
                Delete
              </button>
              {deleting === entry.id && (
                <div
                  role="dialog"
                  aria-label={`Delete ${entry.role} at ${entry.organization}`}
                >
                  <p>Delete this experience entry?</p>
                  <button
                    type="button"
                    disabled={pendingOperation === `delete:${entry.id}`}
                    onClick={() => void remove(entry.id)}
                  >
                    {pendingOperation === `delete:${entry.id}`
                      ? 'Deleting…'
                      : 'Confirm delete'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="secondary"
        disabled={reviewing}
        onClick={() => void review()}
      >
        {reviewing ? 'Saving review…' : 'Mark experience reviewed'}
      </button>
      {message && <p>{message}</p>}
    </section>
  )
}
