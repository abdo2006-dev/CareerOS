import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { applicationRepository } from '../lib/applicationRepository'
import { opportunityRepository } from '../lib/opportunityRepository'
import { personalRuntime, type RefreshStatus } from '../lib/personalRuntime'
import type { Application, OpportunitySearchRow } from '../lib/opportunityTypes'

function relativeTime(value: string | null) {
  if (!value) return 'Not refreshed yet'
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  )
  return minutes < 1
    ? 'Just now'
    : minutes === 1
      ? '1 minute ago'
      : `${minutes} minutes ago`
}

export function DashboardPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [opportunities, setOpportunities] = useState<OpportunitySearchRow[]>([])
  const [total, setTotal] = useState(0)
  const [applications, setApplications] = useState<Application[]>([])
  const [refresh, setRefresh] = useState<RefreshStatus | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const [opportunityResult, applicationResult, refreshResult] =
      await Promise.all([
        opportunityRepository.search({}, 'discovered_desc', 0, 5),
        applicationRepository.list(userId),
        personalRuntime.status(),
      ])
    if (!opportunityResult.error) {
      setOpportunities(opportunityResult.data)
      setTotal(opportunityResult.count ?? opportunityResult.data.length)
    }
    if (!applicationResult.error) setApplications(applicationResult.data)
    setRefresh(refreshResult)
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous repository load updates state after resolution
    void load()
  }, [load])
  useEffect(() => {
    if (refresh?.state !== 'refreshing') return
    const timer = window.setInterval(
      () => void personalRuntime.status().then(setRefresh),
      1600,
    )
    return () => window.clearInterval(timer)
  }, [refresh?.state])

  const saved = applications.filter(
    (application) => application.status !== 'closed',
  ).length
  const interviews = applications.filter(
    (application) => application.status === 'interview_scheduled',
  ).length
  const needsAction = applications
    .filter((application) => application.next_action)
    .slice(0, 4)
  return (
    <section className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">Personal career workspace</p>
          <h1>Good to see your progress.</h1>
          <p className="page-subtitle">
            A calm view of your opportunity pipeline and next steps.
          </p>
        </div>
        <button
          className="button-primary"
          type="button"
          disabled={refresh?.state === 'refreshing'}
          onClick={() => void personalRuntime.refresh().then(setRefresh)}
        >
          {refresh?.state === 'refreshing'
            ? 'Refreshing…'
            : 'Refresh opportunities'}
        </button>
      </header>

      <div className="metrics-grid">
        <article className="metric-card">
          <span>Discovered</span>
          <strong>{total}</strong>
          <small>opportunities available</small>
        </article>
        <article className="metric-card">
          <span>In progress</span>
          <strong>{saved}</strong>
          <small>applications being tracked</small>
        </article>
        <article className="metric-card">
          <span>Interviews</span>
          <strong>{interviews}</strong>
          <small>scheduled conversations</small>
        </article>
        <article className="metric-card accent-metric">
          <span>Last refresh</span>
          <strong className="metric-time">
            {relativeTime(refresh?.lastCompletedAt ?? null)}
          </strong>
          <small>
            {refresh?.result
              ? `${refresh.result.checked} opportunities checked`
              : 'Ready when you are'}
          </small>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Freshly discovered</p>
              <h2>Recent opportunities</h2>
            </div>
            <Link to="/opportunities">View all</Link>
          </div>
          {opportunities.length === 0 ? (
            <div className="inline-empty">
              <p>No opportunities imported yet.</p>
              <button
                className="button-primary"
                onClick={() => void personalRuntime.refresh().then(setRefresh)}
              >
                Refresh opportunities
              </button>
            </div>
          ) : (
            <div className="compact-list">
              {opportunities.map((opportunity) => (
                <Link
                  className="compact-row"
                  to={`/opportunities/${opportunity.opportunity_id}`}
                  key={opportunity.opportunity_id}
                >
                  <span>
                    <strong>{opportunity.title}</strong>
                    <small>
                      {opportunity.organization} ·{' '}
                      {opportunity.location_text ?? 'Location not listed'}
                    </small>
                  </span>
                  <span className="muted">{opportunity.remote_mode}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel actions-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Keep momentum</p>
              <h2>Next actions</h2>
            </div>
            <Link to="/applications">Open applications</Link>
          </div>
          {needsAction.length === 0 ? (
            <div className="inline-empty">
              <p>No next actions yet.</p>
              <span>
                Add one from an application to keep your follow-up plan visible
                here.
              </span>
            </div>
          ) : (
            <div className="compact-list">
              {needsAction.map((application) => (
                <Link
                  className="compact-row"
                  to={`/applications/${application.id}`}
                  key={application.id}
                >
                  <span>
                    <strong>{application.next_action}</strong>
                    <small>
                      {application.next_action_due_at
                        ? `Due ${new Date(application.next_action_due_at).toLocaleDateString()}`
                        : 'No due date'}
                    </small>
                  </span>
                  <span className="status-pill">
                    {application.status.replaceAll('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
