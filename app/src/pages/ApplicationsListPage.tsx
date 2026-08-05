import { Link } from 'react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { applicationRepository } from '../lib/applicationRepository'
import { opportunityRepository } from '../lib/opportunityRepository'
import {
  applicationStatusLabels,
  applicationStatusOptions,
  type Application,
} from '../lib/opportunityTypes'

type VersionInfo = {
  title: string
  organization: string
  application_url: string | null
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

type Sort = 'next_action' | 'recent_update'

export function ApplicationsListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [applications, setApplications] = useState<Application[]>([])
  const [versions, setVersions] = useState<Map<string, VersionInfo>>(new Map())
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<Sort>('recent_update')

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const result = await applicationRepository.list(userId)
    if (result.error) {
      setStatus('error')
      return
    }
    setApplications(result.data)
    const versionIds = result.data
      .map((app) => app.opportunity_version_id)
      .filter((id): id is string => Boolean(id))
    const versionsResult = await opportunityRepository.getVersions(versionIds)
    if (!versionsResult.error) {
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
    }
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void load()
  }, [load])

  function titleFor(app: Application): VersionInfo {
    if (app.opportunity_version_id) {
      return (
        versions.get(app.opportunity_version_id) ?? {
          title: 'Opportunity',
          organization: '',
          application_url: null,
        }
      )
    }
    const snapshot = app.private_opportunity_snapshot ?? {}
    return {
      title: (snapshot.title as string) ?? 'Manual opportunity',
      organization: (snapshot.organization_name as string) ?? '',
      application_url: (snapshot.application_url as string | null) ?? null,
    }
  }

  const visible = useMemo(() => {
    let list = applications
    if (statusFilter) list = list.filter((app) => app.status === statusFilter)
    list = [...list]
    if (sort === 'next_action') {
      list.sort((a, b) => {
        if (!a.next_action_due_at) return 1
        if (!b.next_action_due_at) return -1
        return a.next_action_due_at.localeCompare(b.next_action_due_at)
      })
    } else {
      list.sort((a, b) =>
        b.status_updated_at.localeCompare(a.status_updated_at),
      )
    }
    return list
  }, [applications, statusFilter, sort])

  if (status === 'loading')
    return (
      <section>
        <h2>Applications</h2>
        <p>Loading…</p>
      </section>
    )
  if (status === 'error')
    return (
      <section>
        <h2>Applications</h2>
        <p role="alert">Applications could not be loaded.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )

  return (
    <section>
      <h2>Applications</h2>
      <label htmlFor="application-status-filter">Status</label>
      <select
        id="application-status-filter"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="">Any status</option>
        {applicationStatusOptions.map((value) => (
          <option key={value} value={value}>
            {applicationStatusLabels[value]}
          </option>
        ))}
      </select>
      <label htmlFor="application-sort">Sort</label>
      <select
        id="application-sort"
        value={sort}
        onChange={(event) => setSort(event.target.value as Sort)}
      >
        <option value="recent_update">Recently updated</option>
        <option value="next_action">Next action due</option>
      </select>

      {visible.length === 0 ? (
        <p>No applications yet. Start one from an opportunity's detail page.</p>
      ) : (
        <ul>
          {visible.map((app) => {
            const info = titleFor(app)
            return (
              <li key={app.id}>
                <Link to={`/applications/${app.id}`}>
                  <strong>{info.title}</strong>
                </Link>{' '}
                at {info.organization}
                <br />
                <span>Status: {applicationStatusLabels[app.status]}</span>
                {app.applied_at && (
                  <>
                    {' '}
                    · <span>Applied {formatDate(app.applied_at)}</span>
                  </>
                )}
                {app.next_action && (
                  <>
                    <br />
                    <span>Next: {app.next_action}</span>
                    {app.next_action_due_at && (
                      <span> (due {formatDate(app.next_action_due_at)})</span>
                    )}
                  </>
                )}
                {info.application_url && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={info.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open application page
                    </a>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
