import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProfilePage } from './ProfilePage'

const mockSignOut = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdateEq = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signOut: mockSignOut,
  }),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
      insert: (...args: unknown[]) => mockInsert(...args),
      update: () => ({
        eq: (...args: unknown[]) => mockUpdateEq(...args),
      }),
    }),
  },
}))

describe('ProfilePage', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    mockInsert.mockReset()
    mockUpdateEq.mockReset()
  })

  it('shows a loading state before the profile query resolves', () => {
    mockMaybeSingle.mockReturnValue(new Promise(() => {})) // never resolves

    render(<ProfilePage />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows an error state when the profile query fails', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'network error' },
    })

    render(<ProfilePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  })

  it('shows an empty state and lets the user create a profile when none exists yet', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockInsert.mockResolvedValue({ error: null })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { user_id: 'user-1', headline: '' },
      error: null,
    })
    const user = userEvent.setup()

    render(<ProfilePage />)

    expect(await screen.findByText(/no profile yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /create profile/i }))

    expect(mockInsert).toHaveBeenCalledWith({ user_id: 'user-1', headline: '' })
  })

  it('loads the existing headline and saves an edit (authenticated state)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', headline: 'Original headline' },
      error: null,
    })
    mockUpdateEq.mockResolvedValue({ error: null })
    const user = userEvent.setup()

    render(<ProfilePage />)

    const headlineInput = await screen.findByLabelText(/headline/i)
    expect(headlineInput).toHaveValue('Original headline')

    await user.clear(headlineInput)
    await user.type(headlineInput, 'New headline')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mockUpdateEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it('calls signOut when the sign-out button is clicked', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', headline: 'x' },
      error: null,
    })
    const user = userEvent.setup()

    render(<ProfilePage />)
    await screen.findByLabelText(/headline/i)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mockSignOut).toHaveBeenCalled()
  })
})
