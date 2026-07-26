import { render, screen } from '@testing-library/react'
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

describe('App', () => {
  beforeEach(() => {
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
})
