import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BasicProfilePage } from './BasicProfilePage'

const getProfile = vi.fn()
const updateProfile = vi.fn()
const sectionState = vi.fn()
const review = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/profileRepository', () => ({
  profileRepository: {
    get: (...args: unknown[]) => getProfile(...args),
    update: (...args: unknown[]) => updateProfile(...args),
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

const profile = {
  user_id: 'user-1',
  preferred_name: 'Ada',
  headline: 'Engineer',
  degree_program: null,
}
const current = {
  data: [
    {
      section_key: 'basic_profile',
      content_revision: 1,
      reviewed_content_revision: 1,
    },
  ],
  error: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BasicProfilePage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('BasicProfilePage', () => {
  it('hides the editable form while the profile is loading', () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('populates the existing profile before enabling the form', async () => {
    getProfile.mockResolvedValue({ data: profile, error: null })
    sectionState.mockResolvedValue(current)
    renderPage()
    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Engineer')).toBeInTheDocument()
    expect(screen.getByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('offers retry after a load failure instead of an empty form', async () => {
    getProfile.mockResolvedValue({
      data: null,
      error: { code: '', message: '' },
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('routes missing profiles back to the overview without rendering a form', async () => {
    getProfile.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByText(/root profile does not exist/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /return to profile overview/i }),
    ).toHaveAttribute('href', '/profile')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('does not report a zero-row save as success', async () => {
    getProfile.mockResolvedValue({ data: profile, error: null })
    sectionState.mockResolvedValue(current)
    updateProfile.mockResolvedValue({ data: [], error: null })
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Ada')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText(/profile no longer exists/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('refreshes review state after a successful review', async () => {
    getProfile.mockResolvedValue({ data: profile, error: null })
    sectionState
      .mockResolvedValueOnce({
        data: [
          {
            section_key: 'basic_profile',
            content_revision: 1,
            reviewed_content_revision: null,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce(current)
    review.mockResolvedValue({ data: null, error: null })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/Not reviewed/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /mark basic profile reviewed/i }),
    )
    expect(await screen.findByText(/Reviewed and current/)).toBeInTheDocument()
  })

  it('keeps the prior status visible after a failed review', async () => {
    getProfile.mockResolvedValue({ data: profile, error: null })
    sectionState.mockResolvedValue(current)
    review.mockResolvedValue({
      data: null,
      error: { code: '42501', message: '' },
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/Reviewed and current/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /mark basic profile reviewed/i }),
    )
    expect(
      await screen.findByText(/do not have permission/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Reviewed and current/)).toBeInTheDocument()
  })
})
