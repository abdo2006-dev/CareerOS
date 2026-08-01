import { supabase } from './supabaseClient'
import type { ProfileRow } from './profileTypes'

export const profileRepository = {
  async get(userId: string) {
    return supabase
      .from('profiles')
      .select('user_id, preferred_name, headline, degree_program')
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>()
  },
  async create(userId: string) {
    return supabase
      .from('profiles')
      .insert({ user_id: userId })
      .select('user_id')
      .maybeSingle()
  },
  async update(
    userId: string,
    input: { preferred_name: string | null; headline: string | null },
  ) {
    return supabase
      .from('profiles')
      .update(input)
      .eq('user_id', userId)
      .select('user_id')
  },
}
