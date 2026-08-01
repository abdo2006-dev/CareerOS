import { supabase } from './supabaseClient'
import type { SectionState } from './profileTypes'

export const profileReviewRepository = {
  async state(userId: string) {
    const [revisions, reviews] = await Promise.all([
      supabase
        .from('profile_section_revisions')
        .select('section_key, content_revision')
        .eq('user_id', userId),
      supabase
        .from('profile_section_reviews')
        .select('section_key, reviewed_content_revision')
        .eq('user_id', userId),
    ])
    if (revisions.error) return { data: null, error: revisions.error }
    if (reviews.error) return { data: null, error: reviews.error }
    return {
      data: (revisions.data ?? []).map((revision) => ({
        section_key: revision.section_key as SectionState['section_key'],
        content_revision: revision.content_revision,
        reviewed_content_revision:
          reviews.data?.find(
            (review) => review.section_key === revision.section_key,
          )?.reviewed_content_revision ?? null,
      })),
      error: null,
    }
  },
  async review(sectionKey: SectionState['section_key']) {
    return supabase.rpc('review_profile_section', {
      requested_section_key: sectionKey,
    })
  },
}
