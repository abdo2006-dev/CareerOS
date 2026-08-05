import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpportunityDetailPage } from './OpportunityDetailPage'

const get = vi.fn()
const getState = vi.fn()
const getVersion = vi.fn()
const setSaved = vi.fn()
const setHidden = vi.fn()
const getByOpportunity = vi.fn()
const createForOpportunity = vi.fn()
const navigate = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('../lib/opportunityRepository', () => ({
  opportunityRepository: {
    get: (...args: unknown[]) => get(...args),
    getState: (...args: unknown[]) => getState(...args),
    getVersion: (...args: unknown[]) => getVersion(...args),
    setSaved: (...args: unknown[]) => setSaved(...args),
    setHidden: (...args: unknown[]) => setHidden(...args),
  },
}))
vi.mock('../lib/applicationRepository', () => ({
  applicationRepository: {
    getByOpportunity: (...args: unknown[]) => getByOpportunity(...args),
    createForOpportunity: (...args: unknown[]) => createForOpportunity(...args),
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
  description: 'Support the autonomy team.',
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

function renderPage(id = 'opp-1') {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}`]}>
      <Routes>
        <Route
          path="/opportunities/:opportunityId"
          element={<OpportunityDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('OpportunityDetailPage', () => {
  it('shows loading before the opportunity resolves', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows a missing state for an opportunity that no longer exists', async () => {
    get.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
  })

  it('shows a retry option on a loading failure', async () => {
    get.mockResolvedValue({ data: null, error: { code: '', message: 'x' } })
    renderPage()
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders full detail and a safe external link', async () => {
    get.mockResolvedValue({ data: row, error: null })
    getState.mockResolvedValue({ data: null, error: null })
    getByOpportunity.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByRole('heading', {
        name: 'Working Student, Flight Software',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Support the autonomy team.')).toBeInTheDocument()
    const link = screen.getByRole('link', {
      name: /open original source listing/i,
    })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('saves the opportunity, pinning the current version', async () => {
    get.mockResolvedValue({ data: row, error: null })
    getState.mockResolvedValue({ data: null, error: null })
    getByOpportunity.mockResolvedValue({ data: null, error: null })
    setSaved.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', {
      name: 'Working Student, Flight Software',
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(setSaved).toHaveBeenCalledWith('user-1', 'opp-1', 'ver-1', true)
  })

  it('shows the current-vs-saved-version banner when the saved version differs', async () => {
    get.mockResolvedValue({ data: row, error: null })
    getState.mockResolvedValue({
      data: {
        id: 'state-1',
        user_id: 'user-1',
        opportunity_id: 'opp-1',
        saved_at: '2026-08-01T00:00:00Z',
        saved_opportunity_version_id: 'ver-old',
        hidden_at: null,
        notes: null,
      },
      error: null,
    })
    getVersion.mockResolvedValue({
      data: {
        id: 'ver-old',
        opportunity_id: 'opp-1',
        title: 'Working Student, Flight Software (old)',
        organization: 'Helsing',
        description: 'Older description.',
        captured_at: '2026-07-01T00:00:00Z',
      },
      error: null,
    })
    getByOpportunity.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByText(/source listing has changed since you saved it/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Older description.')).toBeInTheDocument()
  })

  it('starts an application and navigates to it', async () => {
    get.mockResolvedValue({ data: row, error: null })
    getState.mockResolvedValue({ data: null, error: null })
    getByOpportunity.mockResolvedValue({ data: null, error: null })
    createForOpportunity.mockResolvedValue({
      data: { id: 'app-1' },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', {
      name: 'Working Student, Flight Software',
    })
    await user.click(screen.getByRole('button', { name: 'Start application' }))
    expect(createForOpportunity).toHaveBeenCalledWith('user-1', 'ver-1')
    expect(navigate).toHaveBeenCalledWith('/applications/app-1')
  })

  it('shows a link to the existing application instead of "Start application" when one exists', async () => {
    get.mockResolvedValue({ data: row, error: null })
    getState.mockResolvedValue({ data: null, error: null })
    getByOpportunity.mockResolvedValue({
      data: { id: 'app-1' },
      error: null,
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: /view application/i }),
    ).toHaveAttribute('href', '/applications/app-1')
    expect(
      screen.queryByRole('button', { name: 'Start application' }),
    ).not.toBeInTheDocument()
  })
})
