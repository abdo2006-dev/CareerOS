import { supabase } from './supabaseClient'
import type { Application, ApplicationStatus } from './opportunityTypes'

const columns =
  'id, user_id, opportunity_version_id, private_opportunity_id, private_opportunity_snapshot, status, applied_at, status_updated_at, next_action, next_action_due_at, notes, contact_note, created_at, updated_at'

export interface ApplicationFieldsInput {
  next_action?: string | null
  next_action_due_at?: string | null
  notes?: string | null
  contact_note?: string | null
}

export const applicationRepository = {
  async list(userId: string) {
    return supabase
      .from('applications')
      .select(columns)
      .eq('user_id', userId)
      .order('status_updated_at', { ascending: false })
      .returns<Application[]>()
  },

  async get(id: string) {
    return supabase
      .from('applications')
      .select(columns)
      .eq('id', id)
      .maybeSingle<Application>()
  },

  async getByOpportunityVersion(userId: string, opportunityVersionId: string) {
    return supabase
      .from('applications')
      .select(columns)
      .eq('user_id', userId)
      .eq('opportunity_version_id', opportunityVersionId)
      .maybeSingle<Application>()
  },

  async getByPrivateOpportunity(userId: string, privateOpportunityId: string) {
    return supabase
      .from('applications')
      .select(columns)
      .eq('user_id', userId)
      .eq('private_opportunity_id', privateOpportunityId)
      .maybeSingle<Application>()
  },

  async createForOpportunity(userId: string, opportunityVersionId: string) {
    return supabase
      .from('applications')
      .insert({ user_id: userId, opportunity_version_id: opportunityVersionId })
      .select(columns)
      .maybeSingle<Application>()
  },

  async createForPrivateOpportunity(
    userId: string,
    privateOpportunityId: string,
  ) {
    return supabase
      .from('applications')
      .insert({ user_id: userId, private_opportunity_id: privateOpportunityId })
      .select(columns)
      .maybeSingle<Application>()
  },

  async updateStatus(id: string, status: ApplicationStatus) {
    return supabase
      .from('applications')
      .update({ status })
      .eq('id', id)
      .select(columns)
      .maybeSingle<Application>()
  },

  async updateFields(id: string, input: ApplicationFieldsInput) {
    return supabase
      .from('applications')
      .update(input)
      .eq('id', id)
      .select(columns)
      .maybeSingle<Application>()
  },

  async remove(id: string) {
    return supabase.from('applications').delete().eq('id', id).select('id')
  },
}
