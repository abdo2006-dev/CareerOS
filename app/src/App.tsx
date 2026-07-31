import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SignInPage } from './pages/SignInPage'
import { ProfilePage } from './pages/ProfilePage'

// This shell decides which screen to render based on whether a session
// exists. That is a user-experience convenience only -- it runs entirely in
// the browser and does not authorize anything. The actual authorization
// boundary is Postgres Row Level Security, enforced server-side on every
// request regardless of what this component renders (see
// docs/RLS_POLICY_MATRIX.md and AGENTS.md).
function AppShell() {
  const { session, loading, initError, retryInit } = useAuth()

  if (initError) {
    return (
      <main>
        <p role="alert">{initError}</p>
        <button type="button" onClick={retryInit}>
          Retry
        </button>
      </main>
    )
  }

  if (loading) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    )
  }

  return session ? <ProfilePage /> : <SignInPage />
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
