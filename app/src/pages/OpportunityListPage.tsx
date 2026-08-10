import { Link } from 'react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { applicationRepository } from '../lib/applicationRepository'
import {
  opportunityRepository,
  PAGE_SIZE,
  type OpportunityFilters,
  type OpportunitySort,
} from '../lib/opportunityRepository'
import { personalRuntime, type RefreshStatus } from '../lib/personalRuntime'
import { privateOpportunityRepository } from '../lib/privateOpportunityRepository'
import {
  employmentTypeLabels,
  employmentTypeOptions,
  opportunityKindLabels,
  opportunityKindOptions,
  remoteModeLabels,
  remoteModeOptions,
  type OpportunitySearchRow,
  type PrivateOpportunity,
  type UserOpportunityStateRow,
} from '../lib/opportunityTypes'
import { errorMessage, safeError } from '../lib/profileTypes'

type SourceOption = { source_key: string; display_name: string }
type Status = 'loading' | 'ready' | 'error'

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}
function preview(value: string) {
  return value.length > 185 ? `${value.slice(0, 185).trim()}…` : value
}
function relative(value: string | null) {
  if (!value) return 'Not refreshed yet'
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  )
  return minutes < 1 ? 'Just now' : `${minutes} min ago`
}

export function OpportunityListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [remoteMode, setRemoteMode] = useState('')
  const [sourceKey, setSourceKey] = useState('')
  const [lifecycleStatus, setLifecycleStatus] = useState('')
  const [locationText, setLocationText] = useState('')
  const [sort, setSort] = useState<OpportunitySort>('discovered_desc')
  const [savedOnly, setSavedOnly] = useState(false)
  const [appliedOnly, setAppliedOnly] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<OpportunitySearchRow[]>([])
  const [total, setTotal] = useState(0)
  const [stateMap, setStateMap] = useState<
    Map<string, UserOpportunityStateRow>
  >(new Map())
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [sources, setSources] = useState<SourceOption[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [refresh, setRefresh] = useState<RefreshStatus | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [manual, setManual] = useState<PrivateOpportunity[]>([])
  const [tab, setTab] = useState<'discovered' | 'manual'>('discovered')

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    const [states, applications] = await Promise.all([
      opportunityRepository.listState(userId),
      applicationRepository.list(userId),
    ])
    if (states.error || applications.error) {
      setStatus('error')
      return
    }
    const nextStates = new Map(
      states.data.map((row) => [row.opportunity_id, row]),
    )
    const nextApplied = new Set(
      applications.data
        .map((application) => application.shared_opportunity_id)
        .filter((id): id is string => Boolean(id)),
    )
    const filters: OpportunityFilters = {
      search,
      opportunityKind: kind || undefined,
      employmentType: employmentType || undefined,
      remoteMode: remoteMode || undefined,
      sourceKey: sourceKey || undefined,
      lifecycleStatus: lifecycleStatus || undefined,
      locationText: locationText || undefined,
    }
    const savedIds = [...nextStates.values()]
      .filter((row) => row.saved_at)
      .map((row) => row.opportunity_id)
    const hiddenIds = [...nextStates.values()]
      .filter((row) => row.hidden_at)
      .map((row) => row.opportunity_id)
    if (!showHidden) filters.excludeOpportunityIds = hiddenIds
    if (savedOnly && appliedOnly)
      filters.includeOpportunityIds = savedIds.filter((id) =>
        nextApplied.has(id),
      )
    else if (savedOnly) filters.includeOpportunityIds = savedIds
    else if (appliedOnly) filters.includeOpportunityIds = [...nextApplied]
    const result = await opportunityRepository.search(filters, sort, page)
    if (result.error) {
      setStatus('error')
      return
    }
    setRows(result.data)
    setTotal(result.count ?? result.data.length)
    setStateMap(nextStates)
    setAppliedIds(nextApplied)
    setStatus('ready')
  }, [
    userId,
    search,
    kind,
    employmentType,
    remoteMode,
    sourceKey,
    lifecycleStatus,
    locationText,
    sort,
    savedOnly,
    appliedOnly,
    showHidden,
    page,
  ])

  const loadMeta = useCallback(async () => {
    if (!userId) return
    const [sourceResult, manualResult, refreshResult] = await Promise.all([
      opportunityRepository.listSources(),
      privateOpportunityRepository.list(userId, false),
      personalRuntime.status(),
    ])
    if (!sourceResult.error) setSources(sourceResult.data)
    if (!manualResult.error) setManual(manualResult.data)
    setRefresh(refreshResult)
  }, [userId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous repository load updates state after resolution
    void load()
  }, [load])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous metadata load updates state after resolution
    void loadMeta()
  }, [loadMeta])
  useEffect(() => {
    if (refresh?.state !== 'refreshing') return
    const timer = window.setInterval(
      () =>
        void personalRuntime.status().then((result) => {
          setRefresh(result)
          if (result?.state === 'ready') {
            void load()
            void loadMeta()
          }
        }),
      1600,
    )
    return () => window.clearInterval(timer)
  }, [refresh?.state, load, loadMeta])

  function change(value: (next: string) => void, next: string) {
    value(next)
    setPage(0)
  }
  async function toggleSave(row: OpportunitySearchRow) {
    if (!userId || pendingId) return
    setPendingId(row.opportunity_id)
    const result = await opportunityRepository.setSaved(
      userId,
      row.opportunity_id,
      row.opportunity_version_id,
      !stateMap.get(row.opportunity_id)?.saved_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPendingId(null)
  }
  async function toggleHide(row: OpportunitySearchRow) {
    if (!userId || pendingId) return
    setPendingId(row.opportunity_id)
    const result = await opportunityRepository.setHidden(
      userId,
      row.opportunity_id,
      !stateMap.get(row.opportunity_id)?.hidden_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await load()
    setPendingId(null)
  }
  function clearAll() {
    setSearch('')
    setKind('')
    setEmploymentType('')
    setRemoteMode('')
    setSourceKey('')
    setLifecycleStatus('')
    setLocationText('')
    setSavedOnly(false)
    setAppliedOnly(false)
    setShowHidden(false)
    setPage(0)
  }
  const active = useMemo(
    () =>
      [
        {
          label:
            kind &&
            opportunityKindLabels[kind as keyof typeof opportunityKindLabels],
          clear: () => setKind(''),
        },
        {
          label:
            employmentType &&
            employmentTypeLabels[
              employmentType as keyof typeof employmentTypeLabels
            ],
          clear: () => setEmploymentType(''),
        },
        {
          label:
            remoteMode &&
            remoteModeLabels[remoteMode as keyof typeof remoteModeLabels],
          clear: () => setRemoteMode(''),
        },
        { label: locationText, clear: () => setLocationText('') },
        { label: savedOnly ? 'Saved' : '', clear: () => setSavedOnly(false) },
        {
          label: appliedOnly ? 'Applied' : '',
          clear: () => setAppliedOnly(false),
        },
      ].filter((item): item is { label: string; clear: () => void } =>
        Boolean(item.label),
      ),
    [kind, employmentType, remoteMode, locationText, savedOnly, appliedOnly],
  )
  const noRun = refresh?.lastCompletedAt === null && total === 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="page opportunities-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Opportunity discovery</p>
          <h1>Opportunities</h1>
          <p className="page-subtitle">
            {total
              ? `${total} opportunities ready to explore`
              : 'Your current discovery workspace'}
          </p>
        </div>
        <div className="header-actions">
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
          <Link className="button-secondary" to="/opportunities/import">
            Add manually
          </Link>
        </div>
      </header>
      <div
        role="tablist"
        className="opportunity-tabs"
        aria-label="Opportunity source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'discovered'}
          className={tab === 'discovered' ? 'active' : ''}
          onClick={() => setTab('discovered')}
        >
          Discovered
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'manual'}
          className={tab === 'manual' ? 'active' : ''}
          onClick={() => setTab('manual')}
        >
          Manual
        </button>
      </div>
      <section className="refresh-strip">
        <span className={`refresh-dot ${refresh?.state ?? 'idle'}`} />
        <span>
          <strong>
            {refresh?.state === 'refreshing'
              ? 'Refreshing your sources…'
              : `Last refresh: ${relative(refresh?.lastCompletedAt ?? null)}`}
          </strong>
          {refresh?.result && (
            <small>
              {refresh.result.checked} checked · {refresh.result.created} new ·{' '}
              {refresh.result.updated} updated · {refresh.result.unchanged}{' '}
              unchanged
            </small>
          )}
        </span>
        <span className="enabled-sources">
          Enabled:{' '}
          {sources.length
            ? sources
                .map((source) =>
                  source.display_name.replace(' (Greenhouse)', ''),
                )
                .join(', ')
            : 'configured sources'}
        </span>
      </section>
      {message && <p role="alert">{message}</p>}
      <div className="search-bar">
        <input
          aria-label="Search opportunities"
          type="search"
          value={search}
          onChange={(event) => change(setSearch, event.target.value)}
          placeholder="Search roles, companies, skills, or locations"
        />
        <button
          type="button"
          className="button-ghost"
          onClick={() => setAdvanced((value) => !value)}
        >
          {advanced ? 'Hide filters' : 'Filters'}
        </button>
      </div>
      <div className="quick-filters">
        <button
          className={
            !savedOnly && !appliedOnly && !locationText && !kind ? 'active' : ''
          }
          type="button"
          onClick={clearAll}
        >
          All
        </button>
        <button
          className={savedOnly ? 'active' : ''}
          type="button"
          onClick={() => {
            setSavedOnly((value) => !value)
            setPage(0)
          }}
        >
          Saved
        </button>
        <button
          className={appliedOnly ? 'active' : ''}
          type="button"
          onClick={() => {
            setAppliedOnly((value) => !value)
            setPage(0)
          }}
        >
          Applied
        </button>
        {['Bremen', 'Hamburg'].map((city) => (
          <button
            className={locationText === city ? 'active' : ''}
            type="button"
            key={city}
            onClick={() =>
              change(setLocationText, locationText === city ? '' : city)
            }
          >
            {city}
          </button>
        ))}
        <button
          className={remoteMode === 'remote' ? 'active' : ''}
          type="button"
          onClick={() =>
            change(setRemoteMode, remoteMode === 'remote' ? '' : 'remote')
          }
        >
          Remote
        </button>
        <button
          className={kind === 'internship' ? 'active' : ''}
          type="button"
          onClick={() =>
            change(setKind, kind === 'internship' ? '' : 'internship')
          }
        >
          Internship
        </button>
        <button
          className={kind === 'working_student' ? 'active' : ''}
          type="button"
          onClick={() =>
            change(setKind, kind === 'working_student' ? '' : 'working_student')
          }
        >
          Working student
        </button>
        <label className="sr-only">
          <input
            aria-label="Saved only"
            type="checkbox"
            checked={savedOnly}
            onChange={(event) => {
              setSavedOnly(event.target.checked)
              setPage(0)
            }}
          />
          Saved only
        </label>
        <label className="sr-only">
          <input
            aria-label="Show hidden"
            type="checkbox"
            checked={showHidden}
            onChange={(event) => {
              setShowHidden(event.target.checked)
              setPage(0)
            }}
          />
          Show hidden
        </label>
      </div>
      <label className="sr-only">
        Employment type
        <select
          value={employmentType}
          onChange={(event) => change(setEmploymentType, event.target.value)}
        >
          <option value="">Any employment type</option>
          {employmentTypeOptions.map((value) => (
            <option key={value} value={value}>
              {employmentTypeLabels[value]}
            </option>
          ))}
        </select>
      </label>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Kind
            <select
              value={kind}
              onChange={(event) => change(setKind, event.target.value)}
            >
              <option value="">Any kind</option>
              {opportunityKindOptions.map((value) => (
                <option key={value} value={value}>
                  {opportunityKindLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Employment
            <select
              value={employmentType}
              onChange={(event) =>
                change(setEmploymentType, event.target.value)
              }
            >
              <option value="">Any type</option>
              {employmentTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {employmentTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Remote
            <select
              value={remoteMode}
              onChange={(event) => change(setRemoteMode, event.target.value)}
            >
              <option value="">Any mode</option>
              {remoteModeOptions.map((value) => (
                <option key={value} value={value}>
                  {remoteModeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select
              value={sourceKey}
              onChange={(event) => change(setSourceKey, event.target.value)}
            >
              <option value="">Any source</option>
              {sources.map((source) => (
                <option key={source.source_key} value={source.source_key}>
                  {source.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lifecycle
            <select
              value={lifecycleStatus}
              onChange={(event) =>
                change(setLifecycleStatus, event.target.value)
              }
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="stale">Stale</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            Sort
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as OpportunitySort)
                setPage(0)
              }}
            >
              <option value="discovered_desc">Recently discovered</option>
              <option value="posted_desc">Recently posted</option>
              <option value="deadline_asc">Deadline soon</option>
              <option value="organization_asc">Company</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => {
                setShowHidden(event.target.checked)
                setPage(0)
              }}
            />{' '}
            Show hidden
          </label>
        </div>
      )}
      {active.length > 0 && (
        <div className="active-filters">
          <span>Active filters</span>
          {active.map((filter) => (
            <button
              className="filter-chip"
              key={filter.label}
              type="button"
              onClick={filter.clear}
            >
              {filter.label} ×
            </button>
          ))}
          <button className="button-ghost" type="button" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}
      <div className="results-heading">
        <span>
          {total} result{total === 1 ? '' : 's'}
        </span>
        {manual.length > 0 && (
          <Link to="/opportunities/import">
            {manual.length} personal entry{manual.length === 1 ? '' : 'ies'}
          </Link>
        )}
      </div>
      {status === 'loading' && (
        <div className="state-card">
          <h2>Loading opportunities…</h2>
          <span className="sr-only">Loading…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="state-card error-state">
          <h2>Opportunities could not be loaded</h2>
          <p>Check that the local runtime is running, then try again.</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {status === 'ready' &&
        rows.length === 0 &&
        (noRun ? (
          <div className="state-card onboarding-state">
            <p className="eyebrow">Start discovering</p>
            <h2>No opportunities imported yet</h2>
            <p>
              CareerOS can fetch roles from your configured sources and bring
              them into one focused workspace.
            </p>
            <button
              className="button-primary"
              type="button"
              onClick={() => void personalRuntime.refresh().then(setRefresh)}
            >
              Refresh opportunities
            </button>
            <small>
              Enabled sources:{' '}
              {sources.map((source) => source.display_name).join(', ') ||
                'configured sources'}
            </small>
          </div>
        ) : (
          <div className="state-card">
            <h2>No opportunities match your filters</h2>
            <p>Try clearing a filter or expanding your search.</p>
            <button
              type="button"
              className="button-secondary"
              onClick={clearAll}
            >
              Clear filters
            </button>
          </div>
        ))}
      {status === 'ready' && rows.length > 0 && (
        <div className="opportunity-grid">
          {rows.map((row) => {
            const state = stateMap.get(row.opportunity_id)
            const saved = Boolean(state?.saved_at)
            const applied = appliedIds.has(row.opportunity_id)
            return (
              <article className="opportunity-card" key={row.opportunity_id}>
                <div className="card-topline">
                  <span className="tag">
                    {opportunityKindLabels[row.opportunity_kind]}
                  </span>
                  {row.application_deadline && (
                    <span className="deadline">
                      Deadline {formatDate(row.application_deadline)}
                    </span>
                  )}
                </div>
                <Link to={`/opportunities/${row.opportunity_id}`}>
                  <h2>{row.title}</h2>
                </Link>
                <p className="company-line">{row.organization}</p>
                <div className="metadata">
                  <span>{row.location_text ?? 'Location not listed'}</span>
                  <span>{remoteModeLabels[row.remote_mode]}</span>
                  <span>{row.source_display_name}</span>
                </div>
                <p className="description-preview">
                  {preview(row.description)}
                </p>
                <footer>
                  <span className="muted">
                    Discovered {formatDate(row.first_discovered_at)}
                  </span>
                  <div className="card-actions">
                    <button
                      type="button"
                      className={saved ? 'saved-action' : 'button-ghost'}
                      disabled={pendingId === row.opportunity_id}
                      onClick={() => void toggleSave(row)}
                    >
                      {saved ? 'Unsave' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={pendingId === row.opportunity_id}
                      onClick={() => void toggleHide(row)}
                    >
                      {state?.hidden_at ? 'Unhide' : 'Hide'}
                    </button>
                    <Link to={`/opportunities/${row.opportunity_id}`}>
                      {applied ? 'Application' : 'View'}
                    </Link>
                  </div>
                </footer>
              </article>
            )
          })}
        </div>
      )}
      {total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <button
            type="button"
            className="button-secondary"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            className="button-secondary"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {total <= PAGE_SIZE && (
        <span className="sr-only">
          Page {page + 1} of {totalPages}
        </span>
      )}
      {tab === 'manual' && (
        <div className="manual-results">
          <ul>
            {manual.map((entry) => (
              <li key={entry.id}>
                <Link to={`/opportunities/manual/${entry.id}`}>
                  <h2>{entry.title}</h2>
                </Link>
                <p>
                  {entry.organization_name} · {entry.location_text}
                </p>
                <span className="tag">Added by you</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
