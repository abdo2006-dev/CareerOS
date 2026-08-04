import { supabase } from './supabaseClient'
import type { InterviewPrepNotes } from './opportunityTypes'

const columns =
  'id, application_id, responsibilities_to_discuss, required_technologies, topics_to_revise, likely_questions, questions_to_ask, interview_date, interview_format, reflections'

export type InterviewPrepInput = Partial<
  Omit<InterviewPrepNotes, 'id' | 'application_id'>
>

export const interviewPrepRepository = {
  async get(applicationId: string) {
    return supabase
      .from('interview_prep_notes')
      .select(columns)
      .eq('application_id', applicationId)
      .maybeSingle<InterviewPrepNotes>()
  },

  async upsert(applicationId: string, input: InterviewPrepInput) {
    const existing = await this.get(applicationId)
    if (existing.error) return existing
    if (existing.data) {
      return supabase
        .from('interview_prep_notes')
        .update(input)
        .eq('application_id', applicationId)
        .select(columns)
        .maybeSingle<InterviewPrepNotes>()
    }
    return supabase
      .from('interview_prep_notes')
      .insert({ application_id: applicationId, ...input })
      .select(columns)
      .maybeSingle<InterviewPrepNotes>()
  },
}
