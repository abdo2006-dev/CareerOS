import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to ' +
      '.env.local and fill in the local Supabase values (see `supabase status`).',
  )
}

// The publishable key is safe to ship to the browser by design -- Postgres
// Row Level Security (not this key) is the actual authorization boundary.
// The secret/service-role key must never appear in this file or anywhere
// under app/.
export const supabase = createClient(supabaseUrl, supabasePublishableKey)
