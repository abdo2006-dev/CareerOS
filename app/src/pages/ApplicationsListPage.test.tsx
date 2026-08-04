import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsListPage } from './ApplicationsListPage'

const list = vi.fn()
const getVersions = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/applicationRepository', () => ({
  applicationRepository: { list: (...args: unknown[]) => list(...args) },
}))
vi.mock('../lib/opportunityRepository', () => ({
  opportunityRepository: {
    getVersions: (...args: unknown[]) => getVersions(...args),
  },
}))

const sharedApp = {
  id: 'app-1',
  user_id: 'user-1',
  opportunity_version_id: 'ver-1',
  private_opportunity_id: null,
  private_opportunity_snapshot: null,
  status: 'applied' as const,
  applied_at: '2026-08-01T00:00:00Z',
  status_updated_at: '2026-08-01T00:00:00Z',
  next_action: 'Follow up with recruiter',
  next_action_due_at: '2026-08-10T00:00:00Z',
  notes: null,
  contact_note: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

const manualApp = {
  ...sharedApp,
  id: 'app-2',
  opportunity_version_id: null,
  private_opportunity_id: 'priv-1',
  private_opportunity_snapshot: {
    title: 'Research Assistant',
    organization_name: 'Fraunhofer IWES',
    application_url: null,
  },
  status: 'preparing' as const,
  next_action: null,
  next_action_due_at: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ApplicationsListPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('ApplicationsListPage', () => {
  it('shows loading before applications resolve', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an empty state with no applications', async () => {
    list.mockResolvedValue({ data: [], error: null })
    getVersions.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(await screen.findByText(/No applications yet/i)).toBeInTheDocument()
  })

  it('shows a retry option on a loading failure', async () => {
    list.mockResolvedValue({ data: null, error: { code: '', message: 'x' } })
    renderPage()
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders a shared application using the resolved version title/organization', async () => {
    list.mockResolvedValue({ data: [sharedApp], error: null })
    getVersions.mockResolvedValue({
      data: [
        {
          id: 'ver-1',
          title: 'Working Student',
          organization: 'Helsing',
          application_url: null,
        },
      ],
      error: null,
    })
    renderPage()
    expect(await screen.findByText('Working Student')).toBeInTheDocument()
    expect(screen.getByText(/at Helsing/)).toBeInTheDocument()
    expect(screen.getByText(/Follow up with recruiter/)).toBeInTheDocument()
  })

  it('renders a manual application using its snapshot, without a version lookup', async () => {
    list.mockResolvedValue({ data: [manualApp], error: null })
    getVersions.mockResolvedValue({ data: [], error: null })
    renderPage()
    expect(await screen.findByText('Research Assistant')).toBeInTheDocument()
    expect(screen.getByText(/at Fraunhofer IWES/)).toBeInTheDocument()
  })

  it('filters applications by status', async () => {
    list.mockResolvedValue({ data: [sharedApp, manualApp], error: null })
    getVersions.mockResolvedValue({
      data: [
        {
          id: 'ver-1',
          title: 'Working Student',
          organization: 'Helsing',
          application_url: null,
        },
      ],
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Working Student')
    expect(screen.getByText('Research Assistant')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'applied')
    expect(screen.getByText('Working Student')).toBeInTheDocument()
    expect(screen.queryByText('Research Assistant')).not.toBeInTheDocument()
  })
})
