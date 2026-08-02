import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EducationListPage } from './EducationListPage'

const list = vi.fn()
const remove = vi.fn()
const setPrimary = vi.fn()
const sectionState = vi.fn()
const review = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/educationRepository', () => ({
  educationRepository: {
    list: (...args: unknown[]) => list(...args),
    remove: (...args: unknown[]) => remove(...args),
    setPrimary: (...args: unknown[]) => setPrimary(...args),
  },
}))
vi.mock('../lib/profileReviewRepository', () => ({
  profileReviewRepository: {
    state: (...args: unknown[]) => sectionState(...args),
    review: (...args: unknown[]) => review(...args),
  },
  reviewStatus: (
    state: Array<{
      reviewed_content_revision: number | null
      content_revision: number
    }>,
  ) =>
    state[0]?.reviewed_content_revision === null
      ? 'not_reviewed'
      : state[0]?.reviewed_content_revision === state[0]?.content_revision
        ? 'current'
        : 'stale',
}))

const entry = {
  id: 'edu-1',
  user_id: 'user-1',
  institution: 'Example University',
  degree: null,
  field: null,
  degree_year: null,
  expected_graduation_month: null,
  expected_graduation_year: null,
  education_status: 'current' as const,
  is_primary: false,
  start_date: null,
  end_date: null,
}
const notReviewed = {
  data: [
    {
      section_key: 'education',
      content_revision: 1,
      reviewed_content_revision: null,
    },
  ],
  error: null,
}
const current = {
  data: [
    {
      section_key: 'education',
      content_revision: 1,
      reviewed_content_revision: 1,
    },
  ],
  error: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EducationListPage />
    </MemoryRouter>,
  )
}
afterEach(() => vi.resetAllMocks())

describe('EducationListPage', () => {
  it('shows the empty state', async () => {
    list.mockResolvedValue({ data: [], error: null })
    sectionState.mockResolvedValue(notReviewed)
    renderPage()
    expect(
      await screen.findByText(/No education entries yet/),
    ).toBeInTheDocument()
  })

  it('shows entries and their primary marker', async () => {
    list.mockResolvedValue({
      data: [{ ...entry, is_primary: true }],
      error: null,
    })
    sectionState.mockResolvedValue(current)
    renderPage()
    expect(await screen.findByText('Example University')).toBeInTheDocument()
    expect(screen.getByText(/Primary/)).toBeInTheDocument()
  })

  it('refreshes visible state after a successful review', async () => {
    list.mockResolvedValue({ data: [], error: null })
    sectionState
      .mockResolvedValueOnce(notReviewed)
      .mockResolvedValueOnce(current)
    review.mockResolvedValue({ data: null, error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Not reviewed/)
    await user.click(
      screen.getByRole('button', { name: /mark education reviewed/i }),
    )
    expect(await screen.findByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('keeps review state after a failed review', async () => {
    list.mockResolvedValue({ data: [], error: null })
    sectionState.mockResolvedValue(current)
    review.mockResolvedValue({
      data: null,
      error: { code: '42501', message: '' },
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Reviewed and current/)
    await user.click(
      screen.getByRole('button', { name: /mark education reviewed/i }),
    )
    expect(
      await screen.findByText(/do not have permission/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('confirms then reloads after a successful delete', async () => {
    list
      .mockResolvedValueOnce({ data: [entry], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    sectionState
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        data: [
          {
            section_key: 'education',
            content_revision: 2,
            reviewed_content_revision: 1,
          },
        ],
        error: null,
      })
    remove.mockResolvedValue({ data: [{ id: 'edu-1' }], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Example University')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(
      await screen.findByText(/No education entries yet/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Stale/)).toBeInTheDocument()
  })

  it('does not claim success for a zero-row delete', async () => {
    list.mockResolvedValue({ data: [entry], error: null })
    sectionState.mockResolvedValue(current)
    remove.mockResolvedValue({ data: [], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Example University')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByText(/may already be gone/i)).toBeInTheDocument()
    expect(
      screen.queryByText('Education entry deleted.'),
    ).not.toBeInTheDocument()
  })
})
