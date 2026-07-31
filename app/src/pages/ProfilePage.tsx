import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

interface ProfileRow {
  user_id: string
  headline: string | null
}

type Status = 'loading' | 'loaded' | 'empty' | 'error'

export function ProfilePage() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id

  const [status, setStatus] = useState<Status>('loading')
  const [headline, setHeadline] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    setErrorMessage(null)

    // RLS scopes this to the signed-in user's own row; a missing profile
    // shows an "empty" state here, never another user's data -- there is no
    // code path in this query that could return a row belonging to anyone
    // else, regardless of what this component does with the result.
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, headline')
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>()

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    if (!data) {
      setStatus('empty')
      return
    }
    setHeadline(data.headline ?? '')
    setStatus('loaded')
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount pattern; state updates land asynchronously once the request resolves
    void loadProfile()
  }, [loadProfile])

  async function handleCreateProfile() {
    if (!userId) return
    setSaving(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from('profiles')
      .insert({ user_id: userId, headline: '' })

    setSaving(false)
    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    await loadProfile()
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    setSaving(true)
    setSaveMessage(null)
    setErrorMessage(null)

    // .select() makes the affected rows come back in `data` so a save that
    // matches zero rows (RLS-filtered, or the row was deleted concurrently)
    // can be told apart from an actual save -- PostgREST returns 200 with no
    // error in both cases, so `error` alone is not enough to confirm success.
    const { data, error } = await supabase
      .from('profiles')
      .update({ headline })
      .eq('user_id', userId)
      .select('user_id')

    setSaving(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }
    if (!data || data.length === 0) {
      await loadProfile()
      return
    }
    setSaveMessage('Saved.')
  }

  async function handleSignOut() {
    setSignOutError(null)
    const { error } = await signOut()
    if (error) {
      setSignOutError(error)
    }
  }

  return (
    <main>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h1>Your profile</h1>
        <button
          type="button"
          className="secondary"
          onClick={() => void handleSignOut()}
        >
          Sign out
        </button>
      </header>

      {signOutError && <p role="alert">{signOutError}</p>}

      {status === 'loading' && <p>Loading…</p>}

      {status === 'error' && <p role="alert">{errorMessage}</p>}

      {status === 'empty' && (
        <div>
          <p>No profile yet.</p>
          <button
            type="button"
            onClick={() => void handleCreateProfile()}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      )}

      {status === 'loaded' && (
        <form onSubmit={handleSave}>
          <div>
            <label htmlFor="headline">Headline</label>
            <input
              id="headline"
              name="headline"
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
            />
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveMessage && <p>{saveMessage}</p>}
        </form>
      )}
    </main>
  )
}
