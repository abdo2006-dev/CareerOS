import { NavLink, Outlet } from 'react-router'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout() {
  const { signOut, personalMode } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    const result = await signOut()
    if (result.error) setError(result.error)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink
          to="/dashboard"
          className="brand"
          aria-label="CareerOS dashboard"
        >
          <span className="brand-mark">C</span>
          <span>CareerOS</span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/opportunities">Opportunities</NavLink>
          <NavLink to="/applications">Applications</NavLink>
          <NavLink to="/profile">Profile</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="personal-indicator">
            {personalMode ? 'Personal workspace' : 'CareerOS'}
          </span>
          {!personalMode && (
            <button
              type="button"
              className="button-ghost"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="app-content">
        {error && <p role="alert">{error}</p>}
        <Outlet />
      </main>
    </div>
  )
}
