export type OpportunityKind =
  | 'internship'
  | 'working_student'
  | 'graduate_program'
  | 'entry_level'
  | 'research_assistant'
  | 'phd'
  | 'scholarship'
  | 'hackathon'
  | 'fellowship'
  | 'other'

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'temporary'
  | 'internship'
  | 'volunteer'
  | 'other'

export type RemoteMode = 'onsite' | 'hybrid' | 'remote' | 'unknown'

export type LifecycleStatus = 'active' | 'stale' | 'closed' | 'unknown'

export type ApplicationStatus =
  | 'preparing'
  | 'applied'
  | 'awaiting_response'
  | 'interview_scheduled'
  | 'interview_complete'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'closed'

export interface OpportunitySearchRow {
  opportunity_id: string
  opportunity_version_id: string
  lifecycle_status: LifecycleStatus
  first_discovered_at: string
  last_checked_at: string
  source_id: string
  source_key: string
  source_display_name: string
  source_listing_id: string
  canonical_source_url: string
  title: string
  organization: string
  description: string
  location_text: string | null
  country: string | null
  region: string | null
  city: string | null
  opportunity_kind: OpportunityKind
  employment_type: EmploymentType
  remote_mode: RemoteMode
  posted_at: string | null
  application_deadline: string | null
  application_url: string | null
  version_captured_at: string
}

export interface UserOpportunityStateRow {
  id: string
  user_id: string
  opportunity_id: string
  saved_at: string | null
  saved_opportunity_version_id: string | null
  hidden_at: string | null
  notes: string | null
}

export interface PrivateOpportunity {
  id: string
  user_id: string
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
  dismissed_at: string | null
  created_at: string
  updated_at: string
}

export interface Application {
  id: string
  user_id: string
  opportunity_version_id: string | null
  private_opportunity_id: string | null
  private_opportunity_snapshot: Record<string, unknown> | null
  status: ApplicationStatus
  applied_at: string | null
  status_updated_at: string
  next_action: string | null
  next_action_due_at: string | null
  notes: string | null
  contact_note: string | null
  created_at: string
  updated_at: string
}

export interface InterviewPrepNotes {
  id: string
  application_id: string
  responsibilities_to_discuss: string | null
  required_technologies: string | null
  topics_to_revise: string | null
  likely_questions: string | null
  questions_to_ask: string | null
  interview_date: string | null
  interview_format: string | null
  reflections: string | null
}

export const opportunityKindLabels: Record<OpportunityKind, string> = {
  internship: 'Internship',
  working_student: 'Working student',
  graduate_program: 'Graduate program',
  entry_level: 'Entry level',
  research_assistant: 'Research assistant',
  phd: 'PhD',
  scholarship: 'Scholarship',
  hackathon: 'Hackathon',
  fellowship: 'Fellowship',
  other: 'Other',
}

export const employmentTypeLabels: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  volunteer: 'Volunteer',
  other: 'Other',
}

export const remoteModeLabels: Record<RemoteMode, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
  unknown: 'Unknown',
}

export const lifecycleStatusLabels: Record<LifecycleStatus, string> = {
  active: 'Active',
  stale: 'Stale',
  closed: 'Closed',
  unknown: 'Unknown',
}

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  preparing: 'Preparing',
  applied: 'Applied',
  awaiting_response: 'Awaiting response',
  interview_scheduled: 'Interview scheduled',
  interview_complete: 'Interview complete',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
}

export const applicationStatusOptions = Object.keys(
  applicationStatusLabels,
) as ApplicationStatus[]

export const opportunityKindOptions = Object.keys(
  opportunityKindLabels,
) as OpportunityKind[]

export const employmentTypeOptions = Object.keys(
  employmentTypeLabels,
) as EmploymentType[]

export const remoteModeOptions = Object.keys(remoteModeLabels) as RemoteMode[]
