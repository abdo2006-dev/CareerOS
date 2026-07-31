import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SignInPage } from './SignInPage'

const mockSignInWithPassword = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
    },
  },
}))

describe('SignInPage', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset()
  })

  it('submits the entered email and password', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    const user = userEvent.setup()

    render(<SignInPage />)

    await user.type(screen.getByLabelText(/email/i), 'dev-owner@careeros.local')
    await user.type(
      screen.getByLabelText(/password/i),
      'unit-test-password-not-a-secret',
    )
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'dev-owner@careeros.local',
      password: 'unit-test-password-not-a-secret',
    })
  })

  it('shows the error message when sign-in fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    const user = userEvent.setup()

    render(<SignInPage />)

    await user.type(screen.getByLabelText(/email/i), 'dev-owner@careeros.local')
    await user.type(
      screen.getByLabelText(/password/i),
      'unit-test-wrong-password-not-a-secret',
    )
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid login credentials',
    )
  })
})
