import { supabase } from './supabaseClient'
import type { EducationEntry, EducationStatus } from './profileTypes'

export type EducationInput = {
  institution: string
  degree: string | null
  field: string | null
  degree_year: number | null
  expected_graduation_month: number | null
  expected_graduation_year: number | null
  education_status: EducationStatus
  start_date: string | null
  end_date: string | null
}

const columns =
  'id, user_id, institution, degree, field, degree_year, expected_graduation_month, expected_graduation_year, education_status, is_primary, start_date, end_date'

export const educationRepository = {
  async list(userId: string) {
    return supabase
      .from('education_entries')
      .select(columns)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<EducationEntry[]>()
  },
  async get(id: string) {
    return supabase
      .from('education_entries')
      .select(columns)
      .eq('id', id)
      .maybeSingle<EducationEntry>()
  },
  async create(userId: string, input: EducationInput) {
    return supabase
      .from('education_entries')
      .insert({ user_id: userId, ...input })
      .select(columns)
      .maybeSingle<EducationEntry>()
  },
  async update(id: string, input: EducationInput) {
    return supabase
      .from('education_entries')
      .update(input)
      .eq('id', id)
      .select(columns)
      .maybeSingle<EducationEntry>()
  },
  async remove(id: string) {
    return supabase.from('education_entries').delete().eq('id', id).select('id')
  },
  async setPrimary(id: string) {
    return supabase.rpc('set_primary_education', { education_id: id })
  },
}
