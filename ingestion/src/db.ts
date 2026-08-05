import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IngestionEnv } from './env.js'

export function createServiceClient(env: IngestionEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
