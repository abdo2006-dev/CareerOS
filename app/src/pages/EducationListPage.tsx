import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { educationRepository } from '../lib/educationRepository'
import {
  profileReviewRepository,
  reviewStatus,
} from '../lib/profileReviewRepository'
import type { EducationEntry } from '../lib/profileTypes'

export function EducationListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [entries, setEntries] = useState<EducationEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [deleting, setDeleting] = useState<string | null>(null)
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
    if (!sections.error)
      setSectionState(reviewStatus(sections.data, 'education'))
    setStatus('ready')
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])
  async function primary(id: string) {
    const result = await educationRepository.setPrimary(id)
    setMessage(
      result.error
        ? 'Only a current education you own can be primary.'
        : 'Primary education updated.',
    )
    await load()
  }
  async function remove(id: string) {
    const result = await educationRepository.remove(id)
    if (result.error || !result.data?.length)
      setMessage('This entry could not be deleted. It may already be gone.')
    else setMessage('Education entry deleted.')
    setDeleting(null)
    await load()
  }
  async function review() {
    const result = await profileReviewRepository.review('education')
    setMessage(
      result.error
        ? 'Education review could not be saved.'
        : 'Education reviewed.',
    )
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
                  onClick={() => void primary(entry.id)}
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleting(entry.id)}
              >
                Delete
              </button>
              {deleting === entry.id && (
                <div role="dialog" aria-label={`Delete ${entry.institution}`}>
                  <p>Delete this education entry?</p>
                  <button type="button" onClick={() => void remove(entry.id)}>
                    Confirm delete
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
      <button type="button" className="secondary" onClick={() => void review()}>
        Mark education reviewed
      </button>
      {message && <p>{message}</p>}
    </section>
  )
}
