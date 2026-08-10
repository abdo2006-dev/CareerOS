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
  personalMode: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const personalMode = import.meta.env.VITE_PERSONAL_MODE === 'true'
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    async function initialize() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      if (error) {
        setInitError(
          'Could not check your local CareerOS session. Please try again.',
        )
        setLoading(false)
        return
      }
      if (data.session || !personalMode) {
        setSession(data.session)
        setLoading(false)
        return
      }
      const email = import.meta.env.VITE_PERSONAL_OWNER_EMAIL
      const password = import.meta.env.VITE_PERSONAL_OWNER_PASSWORD
      if (!email || !password) {
        setInitError(
          'Personal Mode is not ready. Run npm run personal from the repository root.',
        )
        setLoading(false)
        return
      }
      const signIn = await supabase.auth.signInWithPassword({ email, password })
      if (!active) return
      if (signIn.error || !signIn.data.session) {
        setInitError(
          'Personal Mode could not connect to the local workspace. Run npm run personal and try again.',
        )
        setLoading(false)
        return
      }
      setSession(signIn.data.session)
      setLoading(false)
    }

    void initialize().catch(() => {
      if (!active) return
      setInitError(
        'Could not reach the local CareerOS workspace. Please try again.',
      )
      setLoading(false)
    })

    /*
     * Public authentication is intentionally left available for a later
     * deployment. Personal Mode only establishes a local session invisibly.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [retryCount, personalMode])

  function retryInit() {
    setLoading(true)
    setInitError(null)
    setRetryCount((count) => count + 1)
  }

  async function signOut(): Promise<{ error: string | null }> {
    if (personalMode) return { error: null }
    const { error } = await supabase.auth.signOut()
    return { error: error ? 'Sign-out failed. Please try again.' : null }
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, initError, retryInit, signOut, personalMode }}
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
