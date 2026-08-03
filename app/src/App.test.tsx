import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import App from './App'

const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockMaybeSingle = vi.fn()

vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
    }),
  },
}))

vi.mock('./lib/profileRepository', () => ({
  profileRepository: {
    get: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('./lib/educationRepository', () => ({
  educationRepository: {
    list: () => Promise.resolve({ data: [], error: null }),
  },
}))
vi.mock('./lib/experienceRepository', () => ({
  experienceRepository: {
    list: () => Promise.resolve({ data: [], error: null }),
  },
}))
vi.mock('./lib/profileReviewRepository', () => ({
  profileReviewRepository: {
    state: () => Promise.resolve({ data: [], error: null }),
  },
}))

describe('App', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('shows the sign-in screen when there is no session (unauthenticated state)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument()
  })

  it('shows the profile screen when a session exists (authenticated state)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    })

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /your profile/i }),
    ).toBeInTheDocument()
  })

  it('shows a retryable error instead of loading forever when session init returns an error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'internal supabase error detail' },
    })

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    // The credential-free message is shown, not the raw error detail.
    expect(alert).not.toHaveTextContent('internal supabase error detail')
    expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows a retryable error instead of loading forever when session init rejects', async () => {
    mockGetSession.mockRejectedValue(new Error('network down'))

    render(<App />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument()
  })

  it('recovers after clicking Retry once session init succeeds', async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'temporary failure' },
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null })
    const user = userEvent.setup()

    render(<App />)

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument()
    expect(mockGetSession).toHaveBeenCalledTimes(2)
  })
})
