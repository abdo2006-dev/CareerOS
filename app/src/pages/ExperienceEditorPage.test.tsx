import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExperienceEditorPage } from './ExperienceEditorPage'

const get = vi.fn()
const update = vi.fn()
const create = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/experienceRepository', () => ({
  experienceRepository: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
    create: (...args: unknown[]) => create(...args),
  },
}))

const entry = {
  id: 'experience-1',
  user_id: 'user-1',
  experience_kind: 'research' as const,
  organization: 'Example Lab',
  role: 'Research Assistant',
  location: null,
  start_year: 2025,
  start_month: null,
  end_year: null,
  end_month: null,
  is_current: true,
  description: 'Synthetic description',
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/profile/experience/experience-1/edit']}>
      <Routes>
        <Route
          path="/profile/experience/:experienceId/edit"
          element={<ExperienceEditorPage />}
        />
        <Route path="/profile/experience" element={<p>Experience list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/profile/experience/new']}>
      <Routes>
        <Route
          path="/profile/experience/new"
          element={<ExperienceEditorPage />}
        />
        <Route path="/profile/experience" element={<p>Experience list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('ExperienceEditorPage', () => {
  it('shows loading rather than a submit-capable form while editing loads', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderEdit()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save experience/i }),
    ).not.toBeInTheDocument()
  })

  it('renders a bookmarkable create form with accessible labels', () => {
    renderCreate()
    expect(
      screen.getByRole('heading', { name: 'Add experience' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Organization')).toBeInTheDocument()
    expect(screen.getByLabelText('Start month (optional)')).toBeInTheDocument()
  })

  it('populates an existing entry and keeps its current state', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    renderEdit()
    expect(await screen.findByDisplayValue('Example Lab')).toBeInTheDocument()
    expect(screen.getByLabelText(/This experience is current/)).toBeChecked()
    expect(screen.getByLabelText('End year (optional)')).toBeDisabled()
  })

  it('does not render a submit-capable form for a missing entry', async () => {
    get.mockResolvedValue({ data: null, error: null })
    renderEdit()
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save experience/i }),
    ).not.toBeInTheDocument()
  })

  it('offers retry after a safe load failure', async () => {
    get.mockResolvedValue({ data: null, error: { code: '', message: '' } })
    renderEdit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows an accessible validation summary for required and period fields', async () => {
    const user = userEvent.setup()
    renderCreate()
    await user.click(screen.getByRole('button', { name: 'Save experience' }))
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      /Organization is required/i,
    )
    expect(screen.getByLabelText('Organization')).toHaveAttribute(
      'aria-describedby',
      'organization-error',
    )
    expect(screen.getByRole('link', { name: /start year/i })).toHaveAttribute(
      'href',
      '#start_year',
    )
  })

  it('clears and disables end fields when current is selected', async () => {
    const user = userEvent.setup()
    renderCreate()
    await user.type(screen.getByLabelText('End year (optional)'), '2026')
    await user.type(screen.getByLabelText('End month (optional)'), '2')
    await user.click(screen.getByLabelText(/This experience is current/))
    expect(screen.getByLabelText('End year (optional)')).toHaveValue(null)
    expect(screen.getByLabelText('End year (optional)')).toBeDisabled()
    expect(screen.getByLabelText('End month (optional)')).toBeDisabled()
  })

  it('keeps values after a recoverable save failure', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    update.mockResolvedValue({ data: null, error: { code: '', message: '' } })
    const user = userEvent.setup()
    renderEdit()
    const organization = await screen.findByLabelText('Organization')
    await user.clear(organization)
    await user.type(organization, 'Changed Lab')
    await user.click(screen.getByRole('button', { name: 'Save experience' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByDisplayValue('Changed Lab')).toBeInTheDocument()
  })

  it('treats a zero-row update as a missing entry', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    update.mockResolvedValue({ data: null, error: null })
    const user = userEvent.setup()
    renderEdit()
    await screen.findByDisplayValue('Example Lab')
    await user.click(screen.getByRole('button', { name: 'Save experience' }))
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
  })

  it('creates an entry using normalized form values', async () => {
    create.mockResolvedValue({ data: entry, error: null })
    const user = userEvent.setup()
    renderCreate()
    await user.type(screen.getByLabelText('Organization'), ' Example Lab ')
    await user.type(screen.getByLabelText('Role'), ' Research Assistant ')
    await user.type(screen.getByLabelText('Start year'), '2025')
    await user.click(screen.getByRole('button', { name: 'Save experience' }))
    expect(create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        organization: 'Example Lab',
        role: 'Research Assistant',
      }),
    )
    expect(await screen.findByText('Experience list')).toBeInTheDocument()
  })
})
