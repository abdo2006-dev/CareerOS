import { supabase } from './supabaseClient'
import type { ExperienceKind, WorkExperience } from './profileTypes'

export type ExperienceInput = {
  experience_kind: ExperienceKind
  organization: string
  role: string
  location: string | null
  start_year: number
  start_month: number | null
  end_year: number | null
  end_month: number | null
  is_current: boolean
  description: string | null
}

const columns =
  'id, user_id, experience_kind, organization, role, location, start_year, start_month, end_year, end_month, is_current, description'

export const experienceRepository = {
  async list(userId: string) {
    return supabase
      .from('work_experience')
      .select(columns)
      .eq('user_id', userId)
      .order('is_current', { ascending: false })
      .order('start_year', { ascending: false })
      .order('start_month', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<WorkExperience[]>()
  },
  async get(id: string) {
    return supabase
      .from('work_experience')
      .select(columns)
      .eq('id', id)
      .maybeSingle<WorkExperience>()
  },
  async create(userId: string, input: ExperienceInput) {
    return supabase
      .from('work_experience')
      .insert({ user_id: userId, ...input })
      .select(columns)
      .maybeSingle<WorkExperience>()
  },
  async update(id: string, input: ExperienceInput) {
    return supabase
      .from('work_experience')
      .update(input)
      .eq('id', id)
      .select(columns)
      .maybeSingle<WorkExperience>()
  },
  async remove(id: string) {
    return supabase.from('work_experience').delete().eq('id', id).select('id')
  },
}
