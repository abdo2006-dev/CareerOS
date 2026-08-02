import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import {
  profileReviewRepository,
  reviewStatus,
} from '../lib/profileReviewRepository'
import type { EducationEntry } from '../lib/profileTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

export function EducationListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [entries, setEntries] = useState<EducationEntry[]>([])
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
    const result = await educationRepository.list(userId)
    if (result.error) return setStatus('error')
    setEntries(result.data)
    const sections = await profileReviewRepository.state(userId)
    if (sections.error) return setStatus('error')
    setSectionState(reviewStatus(sections.data, 'education'))
    setStatus('ready')
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])
  async function primary(id: string) {
    if (pendingOperation) return
    setPendingOperation(`primary:${id}`)
    const result = await educationRepository.setPrimary(id)
    setMessage(
      result.error
        ? errorMessage(safeError(result.error))
        : 'Primary education updated.',
    )
    if (!result.error) await load()
    setPendingOperation(null)
  }
  async function remove(id: string) {
    if (pendingOperation) return
    setPendingOperation(`delete:${id}`)
    const result = await educationRepository.remove(id)
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else if (!result.data?.length)
      setMessage('This entry could not be deleted. It may already be gone.')
    else {
      setMessage('Education entry deleted.')
      await load()
    }
    setDeleting(null)
    setPendingOperation(null)
  }
  async function review() {
    if (reviewing) return
    setReviewing(true)
    const result = await profileReviewRepository.review('education')
    setMessage(
      result.error
        ? errorMessage(safeError(result.error))
        : 'Education reviewed. Review status was refreshed.',
    )
    if (!result.error) await load()
    setReviewing(false)
  }
  if (status === 'loading')
    return (
      <section>
        <h2>Education</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'error')
    return (
      <section>
        <h2>Education</h2>
        <p role="alert">Education could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )
  return (
    <section>
      <h2>Education</h2>
      <p>
        Review status:{' '}
        {sectionState === 'current'
          ? 'Reviewed and current'
          : sectionState === 'stale'
            ? 'Stale — review again'
            : 'Not reviewed'}
      </p>
      <p>
        <Link to="new">Add education</Link>
      </p>
      {entries.length === 0 ? (
        <p>No education entries yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.institution}</strong>
              {entry.is_primary && ' — Primary'}
              <br />
              <span>{entry.education_status}</span>
              <br />
              <Link to={`${entry.id}/edit`}>Edit</Link>
              {entry.education_status === 'current' && !entry.is_primary && (
                <button
                  type="button"
                  className="secondary"
                  disabled={pendingOperation === `primary:${entry.id}`}
                  onClick={() => void primary(entry.id)}
                >
                  {pendingOperation === `primary:${entry.id}`
                    ? 'Setting primary…'
                    : 'Set primary'}
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={Boolean(pendingOperation)}
                onClick={() => setDeleting(entry.id)}
              >
                Delete
              </button>
              {deleting === entry.id && (
                <div role="dialog" aria-label={`Delete ${entry.institution}`}>
                  <p>Delete this education entry?</p>
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
        {reviewing ? 'Saving review…' : 'Mark education reviewed'}
      </button>
      {message && <p>{message}</p>}
    </section>
  )
}
