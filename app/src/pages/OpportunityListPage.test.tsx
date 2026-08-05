import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpportunityListPage } from './OpportunityListPage'

const search = vi.fn()
const listState = vi.fn()
const setSaved = vi.fn()
const setHidden = vi.fn()
const listSources = vi.fn()
const applicationsList = vi.fn()
const privateList = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/opportunityRepository', () => ({
  PAGE_SIZE: 20,
  opportunityRepository: {
    search: (...args: unknown[]) => search(...args),
    listState: (...args: unknown[]) => listState(...args),
    setSaved: (...args: unknown[]) => setSaved(...args),
    setHidden: (...args: unknown[]) => setHidden(...args),
    listSources: (...args: unknown[]) => listSources(...args),
  },
}))
vi.mock('../lib/privateOpportunityRepository', () => ({
  privateOpportunityRepository: {
    list: (...args: unknown[]) => privateList(...args),
  },
}))
vi.mock('../lib/applicationRepository', () => ({
  applicationRepository: {
    list: (...args: unknown[]) => applicationsList(...args),
  },
}))

const row = {
  opportunity_id: 'opp-1',
  opportunity_version_id: 'ver-1',
  lifecycle_status: 'active' as const,
  first_discovered_at: '2026-08-01T00:00:00Z',
  last_checked_at: '2026-08-01T00:00:00Z',
  source_id: 'source-1',
  source_key: 'greenhouse:helsing',
  source_display_name: 'Helsing (Greenhouse)',
  source_listing_id: 'listing-1',
  canonical_source_url: 'https://job-boards.greenhouse.io/helsing/jobs/1',
  title: 'Working Student, Flight Software',
  organization: 'Helsing',
  description: 'Description.',
  location_text: 'Munich, Germany',
  country: null,
  region: null,
  city: null,
  opportunity_kind: 'working_student' as const,
  employment_type: 'internship' as const,
  remote_mode: 'onsite' as const,
  posted_at: null,
  application_deadline: null,
  application_url: 'https://job-boards.greenhouse.io/helsing/jobs/1',
  version_captured_at: '2026-08-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OpportunityListPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listSources.mockResolvedValue({ data: [], error: null })
})
afterEach(() => vi.resetAllMocks())

describe('OpportunityListPage', () => {
  it('shows loading before results resolve', () => {
    search.mockReturnValue(new Promise(() => {}))
    listState.mockReturnValue(new Promise(() => {}))
    applicationsList.mockReturnValue(new Promise(() => {}))
    privateList.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })

  it('shows an empty state when no opportunities match', async () => {
    search.mockResolvedValue({ data: [], count: 0, error: null })
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(
      await screen.findByText(/No opportunities match your filters/i),
    ).toBeInTheDocument()
  })

  it('shows a retry option on a loading failure', async () => {
    search.mockResolvedValue({
      data: null,
      count: null,
      error: { code: '', message: 'boom' },
    })
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders a real-shaped listing with source, kind, and location', async () => {
    search.mockResolvedValue({ data: [row], count: 1, error: null })
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(
      await screen.findByText('Working Student, Flight Software'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Helsing \(Greenhouse\)/)).toBeInTheDocument()
    expect(screen.getByText(/Munich, Germany/)).toBeInTheDocument()
  })

  it('toggles save on and reloads with the saved badge shown', async () => {
    search.mockResolvedValue({ data: [row], count: 1, error: null })
    listState
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'state-1',
            user_id: 'user-1',
            opportunity_id: 'opp-1',
            saved_at: '2026-08-01T00:00:00Z',
            saved_opportunity_version_id: 'ver-1',
            hidden_at: null,
            notes: null,
          },
        ],
        error: null,
      })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    setSaved.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Working Student, Flight Software')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(setSaved).toHaveBeenCalledWith('user-1', 'opp-1', 'ver-1', true)
    expect(
      await screen.findByRole('button', { name: 'Unsave' }),
    ).toBeInTheDocument()
  })

  it('excludes hidden opportunities server-side (before pagination), not by filtering an already-paginated page in React', async () => {
    // Regression for the bug where hidden/saved/applied-only filtering was
    // applied client-side *after* an already-paginated page came back,
    // which could hide matching rows that existed on another unexamined
    // page. The fix pushes exclude/include id sets into search() itself, so
    // this asserts the exact filters.excludeOpportunityIds sent, and that
    // the rendered rows/count come directly from whatever search() returns
    // (no further client-side removal).
    listState.mockResolvedValue({
      data: [
        {
          id: 'state-1',
          user_id: 'user-1',
          opportunity_id: 'opp-1',
          saved_at: null,
          saved_opportunity_version_id: null,
          hidden_at: '2026-08-01T00:00:00Z',
          notes: null,
        },
      ],
      error: null,
    })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    search.mockImplementation(
      (filters: { excludeOpportunityIds?: string[] }) => {
        const excluded = filters.excludeOpportunityIds ?? []
        if (excluded.includes('opp-1')) {
          return Promise.resolve({ data: [], count: 0, error: null })
        }
        return Promise.resolve({ data: [row], count: 1, error: null })
      },
    )
    const user = userEvent.setup()
    renderPage()
    expect(
      await screen.findByText(/No opportunities match your filters/i),
    ).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ excludeOpportunityIds: ['opp-1'] }),
      expect.anything(),
      0,
    )

    await user.click(screen.getByLabelText('Show hidden'))
    expect(
      await screen.findByText('Working Student, Flight Software'),
    ).toBeInTheDocument()
    const lastCall = search.mock.calls.at(-1)
    expect(
      (lastCall?.[0] as { excludeOpportunityIds?: string[] })
        .excludeOpportunityIds,
    ).toBeUndefined()
  })

  it('short-circuits saved-only to zero rows via includeOpportunityIds: [] when nothing is saved, without a stale total', async () => {
    search.mockImplementation(
      (filters: { includeOpportunityIds?: string[] }) => {
        if (filters.includeOpportunityIds) {
          const matching =
            filters.includeOpportunityIds.length === 0 ? [] : [row]
          return Promise.resolve({
            data: matching,
            count: matching.length,
            error: null,
          })
        }
        return Promise.resolve({ data: [row], count: 1, error: null })
      },
    )
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Working Student, Flight Software')
    await user.click(screen.getByLabelText('Saved only'))
    expect(
      await screen.findByText(/No opportunities match your filters/i),
    ).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeOpportunityIds: [] }),
      expect.anything(),
      0,
    )
    expect(screen.getByText(/^Page 1 of 1$/)).toBeInTheDocument()
  })

  it('resets to page 1 when a filter changes while on a later page', async () => {
    search.mockResolvedValue({ data: [row], count: 45, error: null })
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({ data: [], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Working Student, Flight Software')
    expect(screen.getByText(/^Page 1 of 3$/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/^Page 2 of 3$/)).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      1,
    )

    await user.selectOptions(
      screen.getByLabelText('Employment type'),
      'internship',
    )
    expect(await screen.findByText(/^Page 1 of 3$/)).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ employmentType: 'internship' }),
      expect.anything(),
      0,
    )
  })

  it('switches to the Manual tab and shows the user-added opportunity', async () => {
    search.mockResolvedValue({ data: [], count: 0, error: null })
    listState.mockResolvedValue({ data: [], error: null })
    applicationsList.mockResolvedValue({ data: [], error: null })
    privateList.mockResolvedValue({
      data: [
        {
          id: 'priv-1',
          user_id: 'user-1',
          source_url: 'https://example.test/job',
          title: 'Research Assistant',
          organization_name: 'Fraunhofer IWES',
          location_text: 'Bremen, Germany',
          opportunity_kind: 'research_assistant',
          employment_type: 'part_time',
          remote_mode: 'unknown',
          description_text: null,
          posted_at: null,
          application_deadline: null,
          application_url: null,
          dismissed_at: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Manual' }))
    expect(await screen.findByText('Research Assistant')).toBeInTheDocument()
    expect(
      within(screen.getByText('Research Assistant').closest('li')!).getByText(
        /Added by you/,
      ),
    ).toBeInTheDocument()
  })
})
