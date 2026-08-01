import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useRouteError,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProfileLayout } from './pages/ProfileLayout'
import { ProfilePage } from './pages/ProfilePage'
import { SignInPage } from './pages/SignInPage'

function AuthPending() {
  const { initError, loading, retryInit } = useAuth()
  if (loading)
    return (
      <main>
        <p>Loading…</p>
      </main>
    )
  if (initError) {
    return (
      <main>
        <p role="alert">Could not check your sign-in status.</p>
        <button type="button" onClick={retryInit}>
          Retry
        </button>
      </main>
    )
  }
  return null
}

function RootRedirect() {
  const { session, loading, initError } = useAuth()
  if (loading || initError) return <AuthPending />
  return <Navigate to={session ? '/profile' : '/sign-in'} replace />
}

function RequireAuth() {
  const { session, loading, initError } = useAuth()
  if (loading || initError) return <AuthPending />
  return session ? <Outlet /> : <Navigate to="/sign-in" replace />
}

function SignInRoute() {
  const { session, loading, initError } = useAuth()
  if (loading || initError) return <AuthPending />
  return session ? <Navigate to="/profile" replace /> : <SignInPage />
}

function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested is not available.</p>
    </main>
  )
}

function RouteErrorPage() {
  useRouteError()
  return (
    <main>
      <h1>Something went wrong</h1>
      <p role="alert">
        The page could not be displayed. Please return to your profile and try
        again.
      </p>
    </main>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <RootRedirect />, errorElement: <RouteErrorPage /> },
  {
    path: '/sign-in',
    element: <SignInRoute />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/profile',
        element: <ProfileLayout />,
        children: [
          { index: true, element: <ProfilePage /> },
          { path: 'basic', element: <ProfilePage /> },
          { path: 'education', element: <ProfilePage /> },
          { path: 'education/new', element: <ProfilePage /> },
          { path: 'education/:educationId/edit', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
