import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EducationEditorPage } from './EducationEditorPage'

const get = vi.fn()
const update = vi.fn()
const create = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/educationRepository', () => ({
  educationRepository: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
    create: (...args: unknown[]) => create(...args),
  },
}))

const entry = {
  id: 'edu-1',
  user_id: 'user-1',
  institution: 'Example University',
  degree: 'BSc',
  field: 'Computing',
  degree_year: 3,
  expected_graduation_month: 6,
  expected_graduation_year: 2028,
  education_status: 'current',
  is_primary: false,
  start_date: '2024-09-01',
  end_date: null,
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/profile/education/edu-1/edit']}>
      <Routes>
        <Route
          path="/profile/education/:educationId/edit"
          element={<EducationEditorPage />}
        />
        <Route path="/profile/education" element={<p>Education list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('EducationEditorPage', () => {
  it('shows loading rather than an empty editable form', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderEdit()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('populates an existing entry once it loads', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    renderEdit()
    expect(
      await screen.findByDisplayValue('Example University'),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('BSc')).toBeInTheDocument()
  })

  it('does not render a submit-capable form for a missing entry', async () => {
    get.mockResolvedValue({ data: null, error: null })
    renderEdit()
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save education/i }),
    ).not.toBeInTheDocument()
  })

  it('offers a retry for a safe load failure', async () => {
    get.mockResolvedValue({ data: null, error: { code: '', message: '' } })
    renderEdit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps entered values after a recoverable save failure', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    update.mockResolvedValue({ data: null, error: { code: '', message: '' } })
    const user = userEvent.setup()
    renderEdit()
    const institution = await screen.findByLabelText('Institution')
    await user.clear(institution)
    await user.type(institution, 'Changed University')
    await user.click(screen.getByRole('button', { name: 'Save education' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByDisplayValue('Changed University')).toBeInTheDocument()
  })

  it('treats a zero-row update as a missing entry', async () => {
    get.mockResolvedValue({ data: entry, error: null })
    update.mockResolvedValue({ data: null, error: null })
    const user = userEvent.setup()
    renderEdit()
    await screen.findByDisplayValue('Example University')
    await user.click(screen.getByRole('button', { name: 'Save education' }))
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save education/i }),
    ).not.toBeInTheDocument()
  })
})
