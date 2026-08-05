import { fetchWithRetry } from '../httpRetry.js'
import { normalizeUrl } from '../identity.js'
import { sanitizeDescription } from '../sanitize.js'
import type { NormalizedListing, RemoteMode, SourceRow } from './types.js'

export const GREENHOUSE_ADAPTER_KIND = 'greenhouse'
export const GREENHOUSE_ADAPTER_VERSION = 'greenhouse/1.0.0'

// Per docs/DATA_SOURCES_AND_COMPLIANCE.md #3 (Greenhouse Job Board API):
// unauthenticated, robots.txt-permitted GET, no documented rate limit --
// this is a conservative self-imposed limit regardless.
export const GREENHOUSE_POLITENESS = {
  minIntervalMs: 1000,
  maxRequestsPerRun: 1,
  userAgent:
    'CareerOS-Ingestion/1.0 (+https://github.com/abdo2006-dev/CareerOS; personal local ingestion, contact via repository issues)',
  timeoutMs: 15_000,
  maxResponseBytes: 8 * 1024 * 1024,
}

interface GreenhouseJobRaw {
  id?: unknown
  title?: unknown
  absolute_url?: unknown
  location?: unknown
  updated_at?: unknown
  first_published?: unknown
  application_deadline?: unknown
  company_name?: unknown
  content?: unknown
  departments?: unknown
  offices?: unknown
}

export interface GreenhouseJob {
  id: number
  title: string
  absoluteUrl: string
  locationName: string | null
  updatedAt: string | null
  firstPublished: string | null
  applicationDeadline: string | null
  companyName: string | null
  content: string
  departments: string[]
  offices: string[]
}

function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is { name: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === 'string',
    )
    .map((entry) => entry.name)
    .slice(0, 10)
}

/**
 * Hand-written type guard per docs/INGESTION_ARCHITECTURE.md #3 -- a single
 * adapter with a modest field count does not justify a zod dependency.
 * Throws on shape mismatch; the orchestrator catches this per-record so one
 * malformed job never aborts the whole run.
 */
export function parseGreenhouseJob(raw: unknown): GreenhouseJob {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('job record is not an object')
  }
  const job = raw as GreenhouseJobRaw
  if (typeof job.id !== 'number') throw new Error('job.id must be a number')
  if (typeof job.title !== 'string' || !job.title.trim()) {
    throw new Error('job.title must be a non-empty string')
  }
  if (typeof job.absolute_url !== 'string' || !job.absolute_url.trim()) {
    throw new Error('job.absolute_url must be a non-empty string')
  }
  if (typeof job.content !== 'string') {
    throw new Error('job.content must be a string')
  }

  const location = job.location
  const locationName =
    typeof location === 'object' &&
    location !== null &&
    typeof (location as { name?: unknown }).name === 'string'
      ? ((location as { name: string }).name as string)
      : null

  return {
    id: job.id,
    title: job.title,
    absoluteUrl: job.absolute_url,
    locationName,
    updatedAt: typeof job.updated_at === 'string' ? job.updated_at : null,
    firstPublished:
      typeof job.first_published === 'string' ? job.first_published : null,
    applicationDeadline:
      typeof job.application_deadline === 'string'
        ? job.application_deadline
        : null,
    companyName: typeof job.company_name === 'string' ? job.company_name : null,
    content: job.content,
    departments: namesOf(job.departments),
    offices: namesOf(job.offices),
  }
}

const WORKING_STUDENT_HINTS = ['working student', 'werkstudent']
const INTERNSHIP_HINTS = ['intern', 'internship', 'praktikum', 'praktikant']
const PHD_HINTS = ['phd', 'doctoral', 'doktorand']

/**
 * Best-effort classification from the job title only -- Greenhouse does not
 * provide a structured kind/employment-type field. Deliberately
 * conservative: anything that doesn't match a clear hint falls back to
 * "other"/"full_time" rather than guessing.
 */
export function classifyOpportunityKind(title: string): string {
  const lower = title.toLowerCase()
  if (WORKING_STUDENT_HINTS.some((hint) => lower.includes(hint))) {
    return 'working_student'
  }
  if (INTERNSHIP_HINTS.some((hint) => lower.includes(hint))) return 'internship'
  if (PHD_HINTS.some((hint) => lower.includes(hint))) return 'phd'
  return 'other'
}

export function classifyEmploymentType(
  opportunityKind: string,
  title: string,
): string {
  if (
    opportunityKind === 'internship' ||
    opportunityKind === 'working_student'
  ) {
    return 'internship'
  }
  const lower = title.toLowerCase()
  if (lower.includes('part-time') || lower.includes('part time')) {
    return 'part_time'
  }
  return 'full_time'
}

export function classifyRemoteMode(locationName: string | null): RemoteMode {
  if (!locationName) return 'unknown'
  const lower = locationName.toLowerCase()
  if (lower.includes('remote')) return 'remote'
  if (lower.includes('hybrid')) return 'hybrid'
  return 'onsite'
}

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  source: Pick<SourceRow, 'display_name'>,
): NormalizedListing {
  const opportunityKind = classifyOpportunityKind(job.title)
  const canonicalUrl = normalizeUrl(job.absoluteUrl)
  return {
    externalId: String(job.id),
    canonicalUrl,
    applicationUrl: canonicalUrl,
    title: job.title.trim(),
    organization: job.companyName?.trim() || source.display_name,
    description: sanitizeDescription(job.content),
    locationText: job.locationName,
    country: null,
    region: null,
    city: null,
    remoteMode: classifyRemoteMode(job.locationName),
    opportunityKind,
    employmentType: classifyEmploymentType(opportunityKind, job.title),
    postedAt: job.firstPublished,
    applicationDeadline: job.applicationDeadline,
    sourceUpdatedAt: job.updatedAt,
    sourceMetadata: { departments: job.departments, offices: job.offices },
  }
}

export interface GreenhouseFetchResult {
  records: unknown[]
  pageComplete: boolean
}

/**
 * A single request returns the board's complete job list -- no pagination
 * needed (docs/DATA_SOURCES_AND_COMPLIANCE.md #3). `pageComplete` is only
 * true when the response is a well-formed `{ jobs: [...] }` document; any
 * other shape, or a non-2xx response, is reported incomplete so the
 * orchestrator never treats it as license to close anything.
 */
export async function fetchGreenhouseBoard(
  baseUrl: string,
): Promise<GreenhouseFetchResult> {
  const url = `${baseUrl}?content=true`
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    GREENHOUSE_POLITENESS.timeoutMs,
  )
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': GREENHOUSE_POLITENESS.userAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      return { records: [], pageComplete: false }
    }

    const contentLength = response.headers.get('content-length')
    if (
      contentLength &&
      Number(contentLength) > GREENHOUSE_POLITENESS.maxResponseBytes
    ) {
      throw new Error(
        `response exceeds maxResponseBytes (Content-Length: ${contentLength})`,
      )
    }

    const text = await response.text()
    if (
      Buffer.byteLength(text, 'utf8') > GREENHOUSE_POLITENESS.maxResponseBytes
    ) {
      throw new Error('response exceeds maxResponseBytes')
    }

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return { records: [], pageComplete: false }
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as { jobs?: unknown }).jobs)
    ) {
      return { records: [], pageComplete: false }
    }

    return { records: (body as { jobs: unknown[] }).jobs, pageComplete: true }
  } finally {
    clearTimeout(timeout)
  }
}
