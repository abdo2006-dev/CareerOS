import { Link } from 'react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  PAGE_SIZE,
  opportunityRepository,
  type OpportunityFilters,
  type OpportunitySort,
} from '../lib/opportunityRepository'
import { privateOpportunityRepository } from '../lib/privateOpportunityRepository'
import { applicationRepository } from '../lib/applicationRepository'
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

type Tab = 'discovered' | 'manual'
type Status = 'loading' | 'ready' | 'error'
type SourceOption = { source_key: string; display_name: string }

const locationPresets = ['Bremen', 'Hamburg']

function formatDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function OpportunityListPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [tab, setTab] = useState<Tab>('discovered')

  // Discovered (shared) state -------------------------------------------
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [remoteMode, setRemoteMode] = useState('')
  const [sourceKey, setSourceKey] = useState('')
  const [lifecycleStatus, setLifecycleStatus] = useState('')
  const [locationText, setLocationText] = useState('')
  const [sort, setSort] = useState<OpportunitySort>('discovered_desc')
  const [showHidden, setShowHidden] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [appliedOnly, setAppliedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<OpportunitySearchRow[]>([])
  const [total, setTotal] = useState(0)
  const [stateMap, setStateMap] = useState<
    Map<string, UserOpportunityStateRow>
  >(new Map())
  const [appliedOpportunityIds, setAppliedOpportunityIds] = useState<
    Set<string>
  >(new Set())
  const [sources, setSources] = useState<SourceOption[]>([])
  const [discoveredStatus, setDiscoveredStatus] = useState<Status>('loading')
  const [pendingSave, setPendingSave] = useState<string | null>(null)

  // Manual state ------------------------------------------------------
  const [showDismissed, setShowDismissed] = useState(false)
  const [manualRows, setManualRows] = useState<PrivateOpportunity[]>([])
  const [manualStatus, setManualStatus] = useState<Status>('loading')

  const [message, setMessage] = useState<string | null>(null)

  const loadDiscovered = useCallback(async () => {
    if (!userId) return
    setDiscoveredStatus('loading')

    // State/applications sets are small (per-user) -- fetch them first so
    // saved/hidden/applied filters can be pushed into the shared-opportunity
    // query itself, applied before pagination and the exact count, rather
    // than filtered out of an already-paginated page client-side.
    const [stateResult, applicationsResult] = await Promise.all([
      opportunityRepository.listState(userId),
      applicationRepository.list(userId),
    ])
    if (stateResult.error || applicationsResult.error) {
      setDiscoveredStatus('error')
      return
    }
    const nextStateMap = new Map(
      stateResult.data.map((row) => [row.opportunity_id, row]),
    )
    setStateMap(nextStateMap)
    const appliedIds = new Set(
      applicationsResult.data
        .map((app) => app.shared_opportunity_id)
        .filter((id): id is string => Boolean(id)),
    )
    setAppliedOpportunityIds(appliedIds)

    const hiddenIds = [...nextStateMap.values()]
      .filter((row) => row.hidden_at)
      .map((row) => row.opportunity_id)
    const savedIds = [...nextStateMap.values()]
      .filter((row) => row.saved_at)
      .map((row) => row.opportunity_id)

    const filters: OpportunityFilters = {
      search,
      opportunityKind: kind || undefined,
      employmentType: employmentType || undefined,
      remoteMode: remoteMode || undefined,
      sourceKey: sourceKey || undefined,
      lifecycleStatus: lifecycleStatus || undefined,
      locationText: locationText || undefined,
    }
    if (!showHidden) filters.excludeOpportunityIds = hiddenIds
    if (savedOnly && appliedOnly) {
      filters.includeOpportunityIds = savedIds.filter((id) =>
        appliedIds.has(id),
      )
    } else if (savedOnly) {
      filters.includeOpportunityIds = savedIds
    } else if (appliedOnly) {
      filters.includeOpportunityIds = [...appliedIds]
    }

    const searchResult = await opportunityRepository.search(filters, sort, page)
    if (searchResult.error) {
      setDiscoveredStatus('error')
      return
    }
    setRows(searchResult.data)
    setTotal(searchResult.count ?? searchResult.data.length)
    setDiscoveredStatus('ready')
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
    showHidden,
    savedOnly,
    appliedOnly,
    page,
  ])

  const loadManual = useCallback(async () => {
    if (!userId) return
    setManualStatus('loading')
    const result = await privateOpportunityRepository.list(
      userId,
      showDismissed,
    )
    if (result.error) {
      setManualStatus('error')
      return
    }
    setManualRows(result.data)
    setManualStatus('ready')
  }, [userId, showDismissed])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void loadDiscovered()
  }, [loadDiscovered])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous initial load updates state after the repository resolves
    void loadManual()
  }, [loadManual])

  useEffect(() => {
    let cancelled = false
    void opportunityRepository.listSources().then((result) => {
      if (!cancelled && !result.error) setSources(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setPage(0)
  }

  async function toggleSave(row: OpportunitySearchRow) {
    if (!userId || pendingSave) return
    setPendingSave(row.opportunity_id)
    const isSaved = Boolean(stateMap.get(row.opportunity_id)?.saved_at)
    const result = await opportunityRepository.setSaved(
      userId,
      row.opportunity_id,
      row.opportunity_version_id,
      !isSaved,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await loadDiscovered()
    setPendingSave(null)
  }

  async function toggleHide(row: OpportunitySearchRow) {
    if (!userId || pendingSave) return
    setPendingSave(row.opportunity_id)
    const isHidden = Boolean(stateMap.get(row.opportunity_id)?.hidden_at)
    const result = await opportunityRepository.setHidden(
      userId,
      row.opportunity_id,
      !isHidden,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await loadDiscovered()
    setPendingSave(null)
  }

  async function toggleDismiss(row: PrivateOpportunity) {
    const result = await privateOpportunityRepository.setDismissed(
      row.id,
      !row.dismissed_at,
    )
    if (result.error) setMessage(errorMessage(safeError(result.error)))
    else await loadManual()
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section>
      <h2>Opportunities</h2>
      {message && <p role="alert">{message}</p>}
      <div role="tablist" aria-label="Opportunity source">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'discovered'}
          className={tab === 'discovered' ? '' : 'secondary'}
          onClick={() => setTab('discovered')}
        >
          Discovered
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'manual'}
          className={tab === 'manual' ? '' : 'secondary'}
          onClick={() => setTab('manual')}
        >
          Manual
        </button>
        <Link to="/opportunities/import">Add manually</Link>
      </div>

      {tab === 'discovered' && (
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setPage(0)
              void loadDiscovered()
            }}
          >
            <label htmlFor="opportunity-search">Search</label>
            <input
              id="opportunity-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, organization, description, location"
            />
            <label htmlFor="opportunity-kind">Kind</label>
            <select
              id="opportunity-kind"
              value={kind}
              onChange={(event) => updateFilter(setKind, event.target.value)}
            >
              <option value="">Any kind</option>
              {opportunityKindOptions.map((value) => (
                <option key={value} value={value}>
                  {opportunityKindLabels[value]}
                </option>
              ))}
            </select>
            <label htmlFor="employment-type">Employment type</label>
            <select
              id="employment-type"
              value={employmentType}
              onChange={(event) =>
                updateFilter(setEmploymentType, event.target.value)
              }
            >
              <option value="">Any employment type</option>
              {employmentTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {employmentTypeLabels[value]}
                </option>
              ))}
            </select>
            <label htmlFor="remote-mode">Remote mode</label>
            <select
              id="remote-mode"
              value={remoteMode}
              onChange={(event) =>
                updateFilter(setRemoteMode, event.target.value)
              }
            >
              <option value="">Any remote mode</option>
              {remoteModeOptions.map((value) => (
                <option key={value} value={value}>
                  {remoteModeLabels[value]}
                </option>
              ))}
            </select>
            <label htmlFor="opportunity-source">Source</label>
            <select
              id="opportunity-source"
              value={sourceKey}
              onChange={(event) =>
                updateFilter(setSourceKey, event.target.value)
              }
            >
              <option value="">Any source</option>
              {sources.map((source) => (
                <option key={source.source_key} value={source.source_key}>
                  {source.display_name}
                </option>
              ))}
            </select>
            <label htmlFor="lifecycle-status">Status</label>
            <select
              id="lifecycle-status"
              value={lifecycleStatus}
              onChange={(event) =>
                updateFilter(setLifecycleStatus, event.target.value)
              }
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="stale">Stale</option>
              <option value="closed">Closed</option>
              <option value="unknown">Unknown</option>
            </select>
            <label htmlFor="opportunity-location">Location</label>
            <input
              id="opportunity-location"
              type="text"
              value={locationText}
              onChange={(event) =>
                updateFilter(setLocationText, event.target.value)
              }
              placeholder="e.g. Bremen"
            />
            {locationPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className="secondary"
                aria-pressed={locationText === preset}
                onClick={() => {
                  updateFilter(setLocationText, preset)
                  void loadDiscovered()
                }}
              >
                {preset}
              </button>
            ))}
            <p>
              Location matches plain text only -- there is no geocoding or
              structured location normalization yet, so unusual spellings may
              not match.
            </p>
            <label htmlFor="opportunity-sort">Sort</label>
            <select
              id="opportunity-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as OpportunitySort)
              }
            >
              <option value="discovered_desc">Recently discovered</option>
              <option value="posted_desc">Recently posted</option>
              <option value="deadline_asc">Deadline soon</option>
              <option value="organization_asc">Organization</option>
              <option value="title_asc">Title</option>
            </select>
            <button type="submit">Search</button>
          </form>
          <label htmlFor="show-hidden">
            <input
              id="show-hidden"
              type="checkbox"
              checked={showHidden}
              onChange={(event) =>
                updateFilter(setShowHidden, event.target.checked)
              }
            />{' '}
            Show hidden
          </label>
          <label htmlFor="saved-only">
            <input
              id="saved-only"
              type="checkbox"
              checked={savedOnly}
              onChange={(event) =>
                updateFilter(setSavedOnly, event.target.checked)
              }
            />{' '}
            Saved only
          </label>
          <label htmlFor="applied-only">
            <input
              id="applied-only"
              type="checkbox"
              checked={appliedOnly}
              onChange={(event) =>
                updateFilter(setAppliedOnly, event.target.checked)
              }
            />{' '}
            Applied only
          </label>

          {discoveredStatus === 'loading' && <p>Loading…</p>}
          {discoveredStatus === 'error' && (
            <div>
              <p role="alert">Opportunities could not be loaded.</p>
              <button type="button" onClick={() => void loadDiscovered()}>
                Retry
              </button>
            </div>
          )}
          {discoveredStatus === 'ready' && rows.length === 0 && (
            <p>No opportunities match your filters.</p>
          )}
          {discoveredStatus === 'ready' && rows.length > 0 && (
            <ul>
              {rows.map((row) => {
                const state = stateMap.get(row.opportunity_id)
                const isSaved = Boolean(state?.saved_at)
                const isHidden = Boolean(state?.hidden_at)
                const isApplied = appliedOpportunityIds.has(row.opportunity_id)
                return (
                  <li key={row.opportunity_id}>
                    <Link to={`/opportunities/${row.opportunity_id}`}>
                      <strong>{row.title}</strong>
                    </Link>{' '}
                    at {row.organization}
                    <br />
                    <span>{row.source_display_name}</span> ·{' '}
                    <span>{opportunityKindLabels[row.opportunity_kind]}</span> ·{' '}
                    <span>{remoteModeLabels[row.remote_mode]}</span>
                    {row.location_text && (
                      <>
                        {' '}
                        · <span>{row.location_text}</span>
                      </>
                    )}
                    <br />
                    <span>
                      Discovered {formatDate(row.first_discovered_at)}
                    </span>
                    {row.application_deadline && (
                      <>
                        {' '}
                        ·{' '}
                        <span>
                          Deadline {formatDate(row.application_deadline)}
                        </span>
                      </>
                    )}
                    {row.lifecycle_status !== 'active' && (
                      <>
                        {' '}
                        <span>({row.lifecycle_status})</span>
                      </>
                    )}
                    {isSaved && <span> · Saved</span>}
                    {isApplied && <span> · Applied</span>}
                    {isHidden && <span> · Hidden</span>}
                    <br />
                    <button
                      type="button"
                      className="secondary"
                      disabled={pendingSave === row.opportunity_id}
                      onClick={() => void toggleSave(row)}
                    >
                      {isSaved ? 'Unsave' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={pendingSave === row.opportunity_id}
                      onClick={() => void toggleHide(row)}
                    >
                      {isHidden ? 'Unhide' : 'Hide'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div>
            <button
              type="button"
              className="secondary"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span>
              {' '}
              Page {page + 1} of {totalPages}{' '}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {tab === 'manual' && (
        <div>
          <label htmlFor="show-dismissed">
            <input
              id="show-dismissed"
              type="checkbox"
              checked={showDismissed}
              onChange={(event) => setShowDismissed(event.target.checked)}
            />{' '}
            Show hidden
          </label>
          {manualStatus === 'loading' && <p>Loading…</p>}
          {manualStatus === 'error' && (
            <div>
              <p role="alert">Manual opportunities could not be loaded.</p>
              <button type="button" onClick={() => void loadManual()}>
                Retry
              </button>
            </div>
          )}
          {manualStatus === 'ready' && manualRows.length === 0 && (
            <p>
              No manually added opportunities yet.{' '}
              <Link to="/opportunities/import">Add one</Link>.
            </p>
          )}
          {manualStatus === 'ready' && manualRows.length > 0 && (
            <ul>
              {manualRows.map((row) => (
                <li key={row.id}>
                  <Link to={`/opportunities/manual/${row.id}`}>
                    <strong>{row.title}</strong>
                  </Link>{' '}
                  at {row.organization_name}
                  <br />
                  <span>Added by you</span> ·{' '}
                  <span>{opportunityKindLabels[row.opportunity_kind]}</span>
                  {row.location_text && (
                    <>
                      {' '}
                      · <span>{row.location_text}</span>
                    </>
                  )}
                  {row.dismissed_at && <span> · Hidden</span>}
                  <br />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void toggleDismiss(row)}
                  >
                    {row.dismissed_at ? 'Unhide' : 'Hide'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
