import { NavLink, Outlet } from 'react-router'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function ProfileLayout() {
  const { signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    const result = await signOut()
    if (result.error) setError(result.error)
  }

  return (
    <main>
      <header className="app-header">
        <h1>CareerOS</h1>
        <button
          type="button"
          className="secondary"
          onClick={() => void handleSignOut()}
        >
          Sign out
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <nav aria-label="Profile sections">
        <NavLink to="/profile" end>
          Overview
        </NavLink>
        <NavLink to="/profile/basic">Basic profile</NavLink>
        <NavLink to="/profile/education">Education</NavLink>
      </nav>
      <Outlet />
    </main>
  )
}
