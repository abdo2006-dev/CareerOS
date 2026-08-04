import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivateOpportunityDetailPage } from './PrivateOpportunityDetailPage'

const get = vi.fn()
const update = vi.fn()
const setDismissed = vi.fn()
const remove = vi.fn()
const getByPrivateOpportunity = vi.fn()
const createForPrivateOpportunity = vi.fn()
const navigate = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('../lib/privateOpportunityRepository', () => ({
  privateOpportunityRepository: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
    setDismissed: (...args: unknown[]) => setDismissed(...args),
    remove: (...args: unknown[]) => remove(...args),
  },
}))
vi.mock('../lib/applicationRepository', () => ({
  applicationRepository: {
    getByPrivateOpportunity: (...args: unknown[]) =>
      getByPrivateOpportunity(...args),
    createForPrivateOpportunity: (...args: unknown[]) =>
      createForPrivateOpportunity(...args),
  },
}))

const entry = {
  id: 'priv-1',
  user_id: 'user-1',
  source_url: 'https://jobs.fraunhofer.de/example',
  title: 'Research Assistant',
  organization_name: 'Fraunhofer IWES',
  location_text: 'Bremen, Germany',
  opportunity_kind: 'research_assistant' as const,
  employment_type: 'part_time' as const,
  remote_mode: 'unknown' as const,
  description_text: 'Support the sensor team.',
  posted_at: null,
  application_deadline: null,
  application_url: null,
  dismissed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/opportunities/manual/priv-1']}>
      <Routes>
        <Route
          path="/opportunities/manual/:privateOpportunityId"
          element={<PrivateOpportunityDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('PrivateOpportunityDetailPage', () => {
  it('shows a missing state for a deleted manual opportunity', async () => {
    get.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
  })

  it('renders the manual entry as "Added by you"', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    getByPrivateOpportunity.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Research Assistant' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Added by you')).toBeInTheDocument()
    expect(screen.getByText('Support the sensor team.')).toBeInTheDocument()
  })

  it('edits and saves the manual opportunity in place', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    getByPrivateOpportunity.mockResolvedValue({ data: null, error: null })
    update.mockResolvedValue({
      data: { ...entry, title: 'Senior Research Assistant' },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Research Assistant' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const titleInput = screen.getByLabelText('Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Senior Research Assistant')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(update).toHaveBeenCalledWith(
      'priv-1',
      expect.objectContaining({ title: 'Senior Research Assistant' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Senior Research Assistant' }),
    ).toBeInTheDocument()
  })

  it('hides the manual opportunity', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    getByPrivateOpportunity.mockResolvedValue({ data: null, error: null })
    setDismissed.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Research Assistant' })
    await user.click(screen.getByRole('button', { name: 'Hide' }))
    expect(setDismissed).toHaveBeenCalledWith('priv-1', true)
  })

  it('deletes the manual opportunity and navigates back to the list', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    getByPrivateOpportunity.mockResolvedValue({ data: null, error: null })
    remove.mockResolvedValue({ data: [{ id: 'priv-1' }], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Research Assistant' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).toHaveBeenCalledWith('priv-1')
    expect(navigate).toHaveBeenCalledWith('/opportunities', { replace: true })
  })

  it('starts an application from the manual opportunity', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    getByPrivateOpportunity.mockResolvedValue({ data: null, error: null })
    createForPrivateOpportunity.mockResolvedValue({
      data: { id: 'app-1' },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Research Assistant' })
    await user.click(screen.getByRole('button', { name: 'Start application' }))
    expect(createForPrivateOpportunity).toHaveBeenCalledWith('user-1', 'priv-1')
    expect(navigate).toHaveBeenCalledWith('/applications/app-1')
  })
})
