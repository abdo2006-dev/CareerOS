import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  initError: string | null
  retryInit: () => void
  signOut: () => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setInitError('Could not check your sign-in status. Please try again.')
          setLoading(false)
          return
        }
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setInitError(
          'Could not reach the authentication service. Please try again.',
        )
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [retryCount])

  function retryInit() {
    setLoading(true)
    setInitError(null)
    setRetryCount((count) => count + 1)
  }

  async function signOut(): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signOut()
    return { error: error ? 'Sign-out failed. Please try again.' : null }
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, initError, retryInit, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + accessor hook are conventionally co-located
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
