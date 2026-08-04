import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useRouteError,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppLayout } from './pages/AppLayout'
import { ProfileLayout } from './pages/ProfileLayout'
import { BasicProfilePage } from './pages/BasicProfilePage'
import { EducationEditorPage } from './pages/EducationEditorPage'
import { EducationListPage } from './pages/EducationListPage'
import { ExperienceEditorPage } from './pages/ExperienceEditorPage'
import { ExperienceListPage } from './pages/ExperienceListPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignInPage } from './pages/SignInPage'
import { OpportunityListPage } from './pages/OpportunityListPage'
import { OpportunityDetailPage } from './pages/OpportunityDetailPage'
import { PrivateOpportunityDetailPage } from './pages/PrivateOpportunityDetailPage'
import { ManualOpportunityFormPage } from './pages/ManualOpportunityFormPage'

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
        element: <AppLayout />,
        children: [
          {
            path: '/profile',
            element: <ProfileLayout />,
            children: [
              { index: true, element: <ProfilePage /> },
              { path: 'basic', element: <BasicProfilePage /> },
              { path: 'education', element: <EducationListPage /> },
              { path: 'education/new', element: <EducationEditorPage /> },
              {
                path: 'education/:educationId/edit',
                element: <EducationEditorPage />,
              },
              { path: 'experience', element: <ExperienceListPage /> },
              { path: 'experience/new', element: <ExperienceEditorPage /> },
              {
                path: 'experience/:experienceId/edit',
                element: <ExperienceEditorPage />,
              },
            ],
          },
          { path: '/opportunities', element: <OpportunityListPage /> },
          {
            path: '/opportunities/import',
            element: <ManualOpportunityFormPage />,
          },
          {
            path: '/opportunities/manual/:privateOpportunityId',
            element: <PrivateOpportunityDetailPage />,
          },
          {
            path: '/opportunities/:opportunityId',
            element: <OpportunityDetailPage />,
          },
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
