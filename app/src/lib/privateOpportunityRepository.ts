import { supabase } from './supabaseClient'
import type {
  EmploymentType,
  OpportunityKind,
  PrivateOpportunity,
  RemoteMode,
} from './opportunityTypes'

export type PrivateOpportunityInput = {
  source_url: string
  title: string
  organization_name: string
  location_text: string
  opportunity_kind: OpportunityKind
  employment_type: EmploymentType
  remote_mode: RemoteMode
  description_text: string | null
  posted_at: string | null
  application_deadline: string | null
  application_url: string | null
}

export type PrivateOpportunityUpdate = Omit<
  PrivateOpportunityInput,
  'source_url'
>

const columns =
  'id, user_id, source_url, title, organization_name, location_text, opportunity_kind, employment_type, remote_mode, description_text, posted_at, application_deadline, application_url, dismissed_at, created_at, updated_at'

export const privateOpportunityRepository = {
  async list(userId: string, includeDismissed: boolean) {
    let query = supabase
      .from('private_opportunities')
      .select(columns)
      .eq('user_id', userId)
    if (!includeDismissed) query = query.is('dismissed_at', null)
    return query
      .order('created_at', { ascending: false })
      .returns<PrivateOpportunity[]>()
  },

  async get(id: string) {
    return supabase
      .from('private_opportunities')
      .select(columns)
      .eq('id', id)
      .maybeSingle<PrivateOpportunity>()
  },

  async create(userId: string, input: PrivateOpportunityInput) {
    return supabase
      .from('private_opportunities')
      .insert({ user_id: userId, ...input })
      .select(columns)
      .maybeSingle<PrivateOpportunity>()
  },

  async update(id: string, input: PrivateOpportunityUpdate) {
    return supabase
      .from('private_opportunities')
      .update(input)
      .eq('id', id)
      .select(columns)
      .maybeSingle<PrivateOpportunity>()
  },

  async setDismissed(id: string, dismissed: boolean) {
    return supabase
      .from('private_opportunities')
      .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
      .eq('id', id)
      .select(columns)
      .maybeSingle<PrivateOpportunity>()
  },

  async remove(id: string) {
    return supabase
      .from('private_opportunities')
      .delete()
      .eq('id', id)
      .select('id')
  },
}
