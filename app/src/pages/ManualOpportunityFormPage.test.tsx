import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManualOpportunityFormPage } from './ManualOpportunityFormPage'

const create = vi.fn()
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
    create: (...args: unknown[]) => create(...args),
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <ManualOpportunityFormPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('ManualOpportunityFormPage', () => {
  it('rejects submission without a valid https source URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(
      screen.getByLabelText('Original URL (https://)'),
      'not-a-url',
    )
    await user.click(screen.getByRole('button', { name: /add opportunity/i }))
    expect(
      await screen.findByText(/enter the https:\/\/ url/i),
    ).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('requires title, organization, and location', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(
      screen.getByLabelText('Original URL (https://)'),
      'https://example.test/job',
    )
    await user.click(screen.getByRole('button', { name: /add opportunity/i }))
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(screen.getByText(/organization is required/i)).toBeInTheDocument()
    expect(screen.getByText(/location is required/i)).toBeInTheDocument()
  })

  it('submits a valid manual opportunity and navigates to its detail page', async () => {
    create.mockResolvedValue({ data: { id: 'priv-1' }, error: null })
    const user = userEvent.setup()
    renderPage()
    await user.type(
      screen.getByLabelText('Original URL (https://)'),
      'https://jobs.fraunhofer.de/example',
    )
    await user.type(screen.getByLabelText('Title'), 'Research Assistant')
    await user.type(screen.getByLabelText('Organization'), 'Fraunhofer IWES')
    await user.type(screen.getByLabelText('Location'), 'Bremen, Germany')
    await user.click(screen.getByRole('button', { name: /add opportunity/i }))
    expect(create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        source_url: 'https://jobs.fraunhofer.de/example',
        title: 'Research Assistant',
        organization_name: 'Fraunhofer IWES',
        location_text: 'Bremen, Germany',
      }),
    )
    expect(navigate).toHaveBeenCalledWith('/opportunities/manual/priv-1', {
      replace: true,
    })
  })

  it('shows a validation error message when the save fails', async () => {
    create.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'x' },
    })
    const user = userEvent.setup()
    renderPage()
    await user.type(
      screen.getByLabelText('Original URL (https://)'),
      'https://jobs.fraunhofer.de/example',
    )
    await user.type(screen.getByLabelText('Title'), 'Research Assistant')
    await user.type(screen.getByLabelText('Organization'), 'Fraunhofer IWES')
    await user.type(screen.getByLabelText('Location'), 'Bremen, Germany')
    await user.click(screen.getByRole('button', { name: /add opportunity/i }))
    expect(
      await screen.findByText(/check the highlighted values/i),
    ).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
