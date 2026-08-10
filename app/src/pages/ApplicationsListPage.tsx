import { Link } from 'react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { applicationRepository } from '../lib/applicationRepository'
import { opportunityRepository } from '../lib/opportunityRepository'
import {
  applicationStatusLabels,
  type Application,
} from '../lib/opportunityTypes'

type VersionInfo = {
  title: string
  organization: string
  application_url: string | null
}
type Filter = 'all' | 'preparing' | 'active' | 'interview' | 'closed'
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
        new Date(value),
      )
    : null
}
function group(status: Application['status']): Exclude<Filter, 'all'> {
  if (status === 'preparing') return 'preparing'
  if (status === 'interview_scheduled' || status === 'interview_complete')
    return 'interview'
  if (['rejected', 'withdrawn', 'closed', 'accepted'].includes(status))
    return 'closed'
  return 'active'
}

export function ApplicationsListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [applications, setApplications] = useState<Application[]>([])
  const [versions, setVersions] = useState<Map<string, VersionInfo>>(new Map())
  const [filter, setFilter] = useState<Filter>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<'next_action' | 'recent_update'>(
    'next_action',
  )
  const load = useCallback(async () => {
    if (!userId) return
    setState('loading')
    const result = await applicationRepository.list(userId)
    if (result.error) {
      setState('error')
      return
    }
    setApplications(result.data)
    const ids = result.data
      .map((item) => item.opportunity_version_id)
      .filter((id): id is string => Boolean(id))
    const versionsResult = await opportunityRepository.getVersions(ids)
    if (!versionsResult.error)
      setVersions(
        new Map(
          (versionsResult.data ?? []).map((row) => [
            row.id as string,
            {
              title: row.title as string,
              organization: row.organization as string,
              application_url: row.application_url as string | null,
            },
          ]),
        ),
      )
    setState('ready')
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous repository load updates state after resolution
    void load()
  }, [load])
  function info(app: Application): VersionInfo {
    if (app.opportunity_version_id)
      return (
        versions.get(app.opportunity_version_id) ?? {
          title: 'Opportunity',
          organization: '',
          application_url: null,
        }
      )
    const snapshot = app.private_opportunity_snapshot ?? {}
    return {
      title: (snapshot.title as string) ?? 'Manual opportunity',
      organization: (snapshot.organization_name as string) ?? '',
      application_url: (snapshot.application_url as string) ?? null,
    }
  }
  const counts = {
    all: applications.length,
    preparing: applications.filter((app) => group(app.status) === 'preparing')
      .length,
    active: applications.filter((app) => group(app.status) === 'active').length,
    interview: applications.filter((app) => group(app.status) === 'interview')
      .length,
    closed: applications.filter((app) => group(app.status) === 'closed').length,
  }
  const visible = useMemo(
    () =>
      applications
        .filter(
          (app) =>
            (filter === 'all' || group(app.status) === filter) &&
            (!statusFilter || app.status === statusFilter),
        )
        .sort((a, b) =>
          sort === 'next_action'
            ? (a.next_action_due_at ?? '9999').localeCompare(
                b.next_action_due_at ?? '9999',
              )
            : b.status_updated_at.localeCompare(a.status_updated_at),
        ),
    [applications, filter, statusFilter, sort],
  )
  return (
    <section className="page applications-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Application pipeline</p>
          <h1>Applications</h1>
          <p className="page-subtitle">
            Keep every follow-up, interview and decision in one deliberate
            workspace.
          </p>
        </div>
        <Link className="button-primary" to="/opportunities">
          Browse opportunities
        </Link>
      </header>
      <div className="application-summary">
        {(
          ['all', 'preparing', 'active', 'interview', 'closed'] as Filter[]
        ).map((item) => (
          <button
            type="button"
            key={item}
            className={filter === item ? 'active' : ''}
            onClick={() => setFilter(item)}
          >
            <span>
              {item === 'all'
                ? 'All applications'
                : item === 'active'
                  ? 'Applied / waiting'
                  : item}
            </span>
            <strong>{counts[item]}</strong>
          </button>
        ))}
      </div>
      <div className="workspace-toolbar">
        <span>
          {visible.length} application{visible.length === 1 ? '' : 's'}
        </span>
        <label>
          Status
          <select
            aria-label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Any status</option>
            <option value="preparing">Preparing</option>
            <option value="applied">Applied</option>
            <option value="awaiting_response">Awaiting response</option>
            <option value="interview_scheduled">Interview scheduled</option>
            <option value="interview_complete">Interview complete</option>
            <option value="offer">Offer</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="next_action">Next action</option>
            <option value="recent_update">Recently updated</option>
          </select>
        </label>
      </div>
      {state === 'loading' && (
        <div className="state-card">
          <h2>Loading applications…</h2>
          <span className="sr-only">Loading…</span>
        </div>
      )}
      {state === 'error' && (
        <div className="state-card error-state">
          <h2>Applications could not be loaded</h2>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && visible.length === 0 && (
        <div className="state-card">
          <h2>
            {applications.length
              ? 'No applications in this view'
              : 'No applications yet'}
          </h2>
          <p>
            {applications.length
              ? 'Choose another status group to see those applications.'
              : 'Start an application from an opportunity when you are ready to take action.'}
          </p>
          <Link className="button-primary" to="/opportunities">
            Explore opportunities
          </Link>
        </div>
      )}
      {state === 'ready' && visible.length > 0 && (
        <div className="applications-list">
          {visible.map((app) => {
            const item = info(app)
            return (
              <article key={app.id} className="application-row">
                <div className="application-main">
                  <Link to={`/applications/${app.id}`}>
                    <h2>{item.title}</h2>
                  </Link>
                  <p>{item.organization || 'Personal opportunity'}</p>
                  <span className="sr-only">at {item.organization}</span>
                  <div className="application-meta">
                    <span className={`status-pill status-${group(app.status)}`}>
                      {applicationStatusLabels[app.status]}
                    </span>
                    {app.applied_at && (
                      <span>Applied {formatDate(app.applied_at)}</span>
                    )}
                    {app.next_action_due_at && (
                      <span>Due {formatDate(app.next_action_due_at)}</span>
                    )}
                  </div>
                </div>
                <div className="next-action">
                  <span>Next action</span>
                  <strong>{app.next_action ?? 'No follow-up planned'}</strong>
                </div>
                <Link
                  className="button-secondary"
                  to={`/applications/${app.id}`}
                >
                  Open
                </Link>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
