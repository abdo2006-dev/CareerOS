export type RemoteMode = 'onsite' | 'hybrid' | 'remote' | 'unknown'

/**
 * The common normalized shape every adapter must produce, matching the
 * columns apply_source_listing accepts. See docs/DATA_MODEL.md
 * "opportunity_versions -- implemented field list".
 */
export interface NormalizedListing {
  externalId: string
  canonicalUrl: string
  applicationUrl: string | null
  title: string
  organization: string
  description: string
  locationText: string | null
  country: string | null
  region: string | null
  city: string | null
  remoteMode: RemoteMode
  opportunityKind: string
  employmentType: string
  postedAt: string | null
  applicationDeadline: string | null
  sourceUpdatedAt: string | null
  sourceMetadata: Record<string, unknown>
}

export interface SourceRow {
  id: string
  source_key: string
  adapter_kind: string
  display_name: string
  base_url: string
  enabled: boolean
}
