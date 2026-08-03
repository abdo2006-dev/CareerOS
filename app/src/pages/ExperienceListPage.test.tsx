import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExperienceListPage } from './ExperienceListPage'

const list = vi.fn()
const remove = vi.fn()
const sectionState = vi.fn()
const review = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/experienceRepository', () => ({
  experienceRepository: {
    list: (...args: unknown[]) => list(...args),
    remove: (...args: unknown[]) => remove(...args),
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
  id: 'experience-1',
  user_id: 'user-1',
  experience_kind: 'research' as const,
  organization: 'Example Lab',
  role: 'Research Assistant',
  location: 'Bremen',
  start_year: 2025,
  start_month: 10,
  end_year: null,
  end_month: null,
  is_current: true,
  description: null,
}
const notReviewed = {
  data: [
    {
      section_key: 'experience',
      content_revision: 1,
      reviewed_content_revision: null,
    },
  ],
  error: null,
}
const current = {
  data: [
    {
      section_key: 'experience',
      content_revision: 1,
      reviewed_content_revision: 1,
    },
  ],
  error: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ExperienceListPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('ExperienceListPage', () => {
  it('shows loading before the repository resolves', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an empty experience section and its review state', async () => {
    list.mockResolvedValue({ data: [], error: null })
    sectionState.mockResolvedValue(notReviewed)
    renderPage()
    expect(
      await screen.findByText(/No experience entries yet/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Not reviewed/)).toBeInTheDocument()
  })

  it('renders readable kind and an honest current period', async () => {
    list.mockResolvedValue({ data: [entry], error: null })
    sectionState.mockResolvedValue(current)
    renderPage()
    expect(await screen.findByText('Research')).toBeInTheDocument()
    expect(screen.getByText('Oct 2025 — Present')).toBeInTheDocument()
    expect(screen.getByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('offers retry after a loading failure', async () => {
    list.mockResolvedValue({ data: null, error: { code: '', message: '' } })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be loaded/i,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('refreshes review state after a successful review', async () => {
    list.mockResolvedValue({ data: [], error: null })
    sectionState
      .mockResolvedValueOnce(notReviewed)
      .mockResolvedValueOnce(current)
    review.mockResolvedValue({ data: null, error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Not reviewed/)
    await user.click(
      screen.getByRole('button', { name: /mark experience reviewed/i }),
    )
    expect(await screen.findByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('confirms deletion, reloads, and displays a stale review', async () => {
    list
      .mockResolvedValueOnce({ data: [entry], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    sectionState.mockResolvedValueOnce(current).mockResolvedValueOnce({
      data: [
        {
          section_key: 'experience',
          content_revision: 2,
          reviewed_content_revision: 1,
        },
      ],
      error: null,
    })
    remove.mockResolvedValue({ data: [{ id: entry.id }], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Research Assistant')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(
      await screen.findByText(/No experience entries yet/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Stale/)).toBeInTheDocument()
  })

  it('does not claim success after a zero-row delete', async () => {
    list.mockResolvedValue({ data: [entry], error: null })
    sectionState.mockResolvedValue(current)
    remove.mockResolvedValue({ data: [], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Research Assistant')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByText(/may already be gone/i)).toBeInTheDocument()
    expect(screen.queryByText('Experience deleted.')).not.toBeInTheDocument()
  })
})
