import { supabase } from './supabaseClient'
import type {
  OpportunitySearchRow,
  UserOpportunityStateRow,
} from './opportunityTypes'

export type OpportunitySort =
  | 'discovered_desc'
  | 'posted_desc'
  | 'deadline_asc'
  | 'organization_asc'
  | 'title_asc'

export interface OpportunityFilters {
  search?: string
  opportunityKind?: string
  employmentType?: string
  remoteMode?: string
  sourceKey?: string
  lifecycleStatus?: string
}

const searchColumns =
  'opportunity_id, opportunity_version_id, lifecycle_status, first_discovered_at, last_checked_at, source_id, source_key, source_display_name, source_listing_id, canonical_source_url, title, organization, description, location_text, country, region, city, opportunity_kind, employment_type, remote_mode, posted_at, application_deadline, application_url, version_captured_at'

const stateColumns =
  'id, user_id, opportunity_id, saved_at, saved_opportunity_version_id, hidden_at, notes'

function escapeForIlike(term: string) {
  return term.replace(/[%_,]/g, (char) => `\\${char}`)
}

export const PAGE_SIZE = 20

export const opportunityRepository = {
  async search(
    filters: OpportunityFilters,
    sort: OpportunitySort,
    page: number,
    pageSize = PAGE_SIZE,
  ) {
    let query = supabase
      .from('opportunity_search')
      .select(searchColumns, { count: 'exact' })

    if (filters.search?.trim()) {
      const term = escapeForIlike(filters.search.trim())
      query = query.or(
        `title.ilike.%${term}%,organization.ilike.%${term}%,description.ilike.%${term}%,location_text.ilike.%${term}%`,
      )
    }
    if (filters.opportunityKind)
      query = query.eq('opportunity_kind', filters.opportunityKind)
    if (filters.employmentType)
      query = query.eq('employment_type', filters.employmentType)
    if (filters.remoteMode) query = query.eq('remote_mode', filters.remoteMode)
    if (filters.sourceKey) query = query.eq('source_key', filters.sourceKey)
    if (filters.lifecycleStatus)
      query = query.eq('lifecycle_status', filters.lifecycleStatus)

    switch (sort) {
      case 'posted_desc':
        query = query.order('posted_at', {
          ascending: false,
          nullsFirst: false,
        })
        break
      case 'deadline_asc':
        query = query.order('application_deadline', {
          ascending: true,
          nullsFirst: false,
        })
        break
      case 'organization_asc':
        query = query.order('organization', { ascending: true })
        break
      case 'title_asc':
        query = query.order('title', { ascending: true })
        break
      case 'discovered_desc':
      default:
        query = query.order('first_discovered_at', { ascending: false })
        break
    }

    const from = page * pageSize
    query = query.range(from, from + pageSize - 1)
    return query.returns<OpportunitySearchRow[]>()
  },

  async get(opportunityId: string) {
    return supabase
      .from('opportunity_search')
      .select(searchColumns)
      .eq('opportunity_id', opportunityId)
      .maybeSingle<OpportunitySearchRow>()
  },

  async getVersion(opportunityVersionId: string) {
    return supabase
      .from('opportunity_versions')
      .select(
        'id, opportunity_id, title, organization, description, location_text, remote_mode, opportunity_kind, employment_type, application_url, posted_at, application_deadline, captured_at',
      )
      .eq('id', opportunityVersionId)
      .maybeSingle()
  },

  async getVersions(opportunityVersionIds: string[]) {
    if (opportunityVersionIds.length === 0) return { data: [], error: null }
    return supabase
      .from('opportunity_versions')
      .select(
        'id, opportunity_id, title, organization, application_url, application_deadline',
      )
      .in('id', opportunityVersionIds)
  },

  async listState(userId: string) {
    return supabase
      .from('user_opportunity_state')
      .select(stateColumns)
      .eq('user_id', userId)
      .returns<UserOpportunityStateRow[]>()
  },

  async getState(userId: string, opportunityId: string) {
    return supabase
      .from('user_opportunity_state')
      .select(stateColumns)
      .eq('user_id', userId)
      .eq('opportunity_id', opportunityId)
      .maybeSingle<UserOpportunityStateRow>()
  },

  async setSaved(
    userId: string,
    opportunityId: string,
    opportunityVersionId: string,
    saved: boolean,
  ) {
    const existing = await this.getState(userId, opportunityId)
    if (existing.error) return existing
    if (saved) {
      // Plain insert/update, never .upsert(): an ON CONFLICT DO UPDATE also
      // needs UPDATE privilege on the conflict-key columns (user_id,
      // opportunity_id), which are deliberately not browser-writable.
      if (existing.data) {
        return supabase
          .from('user_opportunity_state')
          .update({
            saved_at: new Date().toISOString(),
            saved_opportunity_version_id: opportunityVersionId,
          })
          .eq('user_id', userId)
          .eq('opportunity_id', opportunityId)
          .select(stateColumns)
          .maybeSingle<UserOpportunityStateRow>()
      }
      return supabase
        .from('user_opportunity_state')
        .insert({
          user_id: userId,
          opportunity_id: opportunityId,
          saved_at: new Date().toISOString(),
          saved_opportunity_version_id: opportunityVersionId,
        })
        .select(stateColumns)
        .maybeSingle<UserOpportunityStateRow>()
    }
    if (existing.data?.hidden_at) {
      return supabase
        .from('user_opportunity_state')
        .update({ saved_at: null, saved_opportunity_version_id: null })
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId)
        .select(stateColumns)
        .maybeSingle<UserOpportunityStateRow>()
    }
    if (existing.data) {
      return supabase
        .from('user_opportunity_state')
        .delete()
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId)
    }
    return { data: null, error: null }
  },

  async setHidden(userId: string, opportunityId: string, hidden: boolean) {
    const existing = await this.getState(userId, opportunityId)
    if (existing.error) return existing
    if (hidden) {
      if (existing.data) {
        return supabase
          .from('user_opportunity_state')
          .update({ hidden_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('opportunity_id', opportunityId)
          .select(stateColumns)
          .maybeSingle<UserOpportunityStateRow>()
      }
      return supabase
        .from('user_opportunity_state')
        .insert({
          user_id: userId,
          opportunity_id: opportunityId,
          hidden_at: new Date().toISOString(),
        })
        .select(stateColumns)
        .maybeSingle<UserOpportunityStateRow>()
    }
    if (existing.data?.saved_at) {
      return supabase
        .from('user_opportunity_state')
        .update({ hidden_at: null })
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId)
        .select(stateColumns)
        .maybeSingle<UserOpportunityStateRow>()
    }
    if (existing.data) {
      return supabase
        .from('user_opportunity_state')
        .delete()
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId)
    }
    return { data: null, error: null }
  },
}
