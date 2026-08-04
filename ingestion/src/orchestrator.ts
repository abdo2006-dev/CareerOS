import type { SupabaseClient } from '@supabase/supabase-js'
import { computeContentHash } from './identity.js'
import type { NormalizedListing, SourceRow } from './adapters/types.js'

const MAX_ERROR_SUMMARY_ENTRIES = 32
const MAX_ERROR_SUMMARY_BYTES = 8192

export interface ErrorEntry {
  type: string
  message: string
}

// Postgrest/Supabase errors are plain objects with a string `.message`, not
// `instanceof Error` -- extract that first so a failed RPC call produces a
// real, readable message instead of "[object Object]".
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return String(error)
}

function pushError(errors: ErrorEntry[], type: string, message: string): void {
  if (errors.length < MAX_ERROR_SUMMARY_ENTRIES) {
    // Never description text or raw payloads (SECURITY_AND_PRIVACY.md #9) --
    // only the error type/message, capped in length.
    errors.push({ type, message: message.slice(0, 300) })
  }
}

function capErrorSummary(errors: ErrorEntry[]): ErrorEntry[] {
  let capped = errors
  while (
    capped.length > 0 &&
    Buffer.byteLength(JSON.stringify(capped), 'utf8') > MAX_ERROR_SUMMARY_BYTES
  ) {
    capped = capped.slice(0, -1)
  }
  return capped
}

export interface IngestPipelineOptions {
  client: SupabaseClient
  source: SourceRow
  records: unknown[]
  pageComplete: boolean
  parse: (raw: unknown) => unknown
  normalize: (raw: unknown, source: SourceRow) => NormalizedListing
}

export interface DryRunSummary {
  recordsFound: number
  wouldCreate: number
  wouldUpdate: number
  wouldBeUnchanged: number
  wouldClose: number
  errorCount: number
  errors: ErrorEntry[]
  pageComplete: boolean
}

interface ExistingListingRow {
  id: string
  opportunity_id: string
  opportunities: { current_version_id: string | null } | null
}

/**
 * Dry run performs *zero writes*, including to ingestion_runs -- it never
 * calls begin_ingestion_run/apply_source_listing/finalize_ingestion_run.
 * Every step (fetch already happened by the time this runs; here: parse,
 * normalize, sanitize, hash, and compare against current database state via
 * plain SELECTs) runs for real, but nothing is persisted.
 */
export async function ingestDryRun(
  options: IngestPipelineOptions,
): Promise<DryRunSummary> {
  const errors: ErrorEntry[] = []
  let wouldCreate = 0
  let wouldUpdate = 0
  let wouldBeUnchanged = 0
  const seenExternalIds = new Set<string>()

  for (const raw of options.records) {
    try {
      const parsed = options.parse(raw)
      const normalized = options.normalize(parsed, options.source)
      seenExternalIds.add(normalized.externalId)
      const contentHash = computeContentHash(normalized)

      const { data: existing, error: listingError } = await options.client
        .from('source_listings')
        .select('id, opportunity_id, opportunities(current_version_id)')
        .eq('source_id', options.source.id)
        .eq('external_id', normalized.externalId)
        .maybeSingle<ExistingListingRow>()
      if (listingError) throw listingError

      if (!existing) {
        wouldCreate += 1
        continue
      }

      const currentVersionId =
        existing.opportunities?.current_version_id ?? null
      let currentHash: string | null = null
      if (currentVersionId) {
        const { data: versionRow, error: versionError } = await options.client
          .from('opportunity_versions')
          .select('content_hash')
          .eq('id', currentVersionId)
          .maybeSingle<{ content_hash: string }>()
        if (versionError) throw versionError
        currentHash = versionRow?.content_hash ?? null
      }

      if (currentHash !== contentHash) wouldUpdate += 1
      else wouldBeUnchanged += 1
    } catch (error) {
      pushError(errors, 'record_error', describeError(error))
    }
  }

  let wouldClose = 0
  if (options.pageComplete) {
    const { data: activeListings, error: activeError } = await options.client
      .from('source_listings')
      .select('external_id, absence_count')
      .eq('source_id', options.source.id)
      .eq('status', 'active')
    if (!activeError && activeListings) {
      wouldClose = activeListings.filter(
        (row: { external_id: string; absence_count: number }) =>
          !seenExternalIds.has(row.external_id) && row.absence_count + 1 >= 2,
      ).length
    }
  }

  return {
    recordsFound: options.records.length,
    wouldCreate,
    wouldUpdate,
    wouldBeUnchanged,
    wouldClose,
    errorCount: errors.length,
    errors: capErrorSummary(errors),
    pageComplete: options.pageComplete,
  }
}

export interface RealRunSummary {
  runId: string
  status: 'complete' | 'partial'
  recordsFound: number
  recordsNew: number
  recordsUpdated: number
  recordsUnchanged: number
  errorCount: number
  errors: ErrorEntry[]
}

interface ApplyListingRpcRow {
  outcome: 'created' | 'updated' | 'unchanged'
  opportunity_id: string
  source_listing_id: string
  opportunity_version_id: string
}

/**
 * The real, writing path: begin_ingestion_run, then apply_source_listing
 * once per record (each call atomic per docs/adr and this migration's
 * design), then finalize_ingestion_run -- which performs the conservative
 * closure step, and only when this run's pageComplete is true.
 */
export async function ingestReal(
  options: IngestPipelineOptions,
): Promise<RealRunSummary> {
  const errors: ErrorEntry[] = []
  let recordsNew = 0
  let recordsUpdated = 0
  let recordsUnchanged = 0

  const { data: runId, error: beginError } = await options.client.rpc(
    'begin_ingestion_run',
    { p_source_key: options.source.source_key, p_dry_run: false },
  )
  if (beginError) throw beginError

  for (const raw of options.records) {
    try {
      const parsed = options.parse(raw)
      const normalized = options.normalize(parsed, options.source)
      const contentHash = computeContentHash(normalized)

      const { data, error } = await options.client.rpc('apply_source_listing', {
        p_source_key: options.source.source_key,
        p_external_id: normalized.externalId,
        p_canonical_source_url: normalized.canonicalUrl,
        p_application_url: normalized.applicationUrl,
        p_title: normalized.title,
        p_organization: normalized.organization,
        p_description: normalized.description,
        p_location_text: normalized.locationText,
        p_country: normalized.country,
        p_region: normalized.region,
        p_city: normalized.city,
        p_remote_mode: normalized.remoteMode,
        p_opportunity_kind: normalized.opportunityKind,
        p_employment_type: normalized.employmentType,
        p_posted_at: normalized.postedAt,
        p_application_deadline: normalized.applicationDeadline,
        p_source_updated_at: normalized.sourceUpdatedAt,
        p_content_hash: contentHash,
        p_source_metadata: normalized.sourceMetadata,
      })
      if (error) throw error

      const outcome = (data as ApplyListingRpcRow[] | null)?.[0]?.outcome
      if (outcome === 'created') recordsNew += 1
      else if (outcome === 'updated') recordsUpdated += 1
      else recordsUnchanged += 1
    } catch (error) {
      pushError(errors, 'record_error', describeError(error))
    }
  }

  const status: 'complete' | 'partial' = options.pageComplete
    ? 'complete'
    : 'partial'
  const cappedErrors = capErrorSummary(errors)

  const { error: finalizeError } = await options.client.rpc(
    'finalize_ingestion_run',
    {
      p_run_id: runId,
      p_status: status,
      p_records_found: options.records.length,
      p_records_new: recordsNew,
      p_records_updated: recordsUpdated,
      p_error_count: errors.length,
      p_error_summary: cappedErrors,
    },
  )
  if (finalizeError) throw finalizeError

  return {
    runId: runId as string,
    status,
    recordsFound: options.records.length,
    recordsNew,
    recordsUpdated,
    recordsUnchanged,
    errorCount: errors.length,
    errors: cappedErrors,
  }
}
