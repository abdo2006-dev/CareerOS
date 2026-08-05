import { createHash } from 'node:crypto'
import type { NormalizedListing } from './adapters/types.js'

/**
 * Conservative URL normalization per docs/INGESTION_ARCHITECTURE.md #5:
 * lowercase scheme+host, strip default port/fragment/userinfo, collapse
 * duplicate slashes, strip one trailing slash. No tracking-parameter
 * stripping here -- that is per-adapter (a significance allowlist), and the
 * Greenhouse adapter does not add one because its URLs carry no query
 * parameters that need it.
 */
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  url.username = ''
  url.password = ''
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }
  let pathname = url.pathname.replace(/\/{2,}/g, '/')
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  url.pathname = pathname
  return url.toString()
}

// ASCII unit separator (code point 31) -- not a character any of the hashed
// text fields can plausibly contain, so a value shifting between adjacent
// fields can never coincidentally produce the same hash as a genuinely
// different posting.
const HASH_FIELD_SEPARATOR = String.fromCharCode(31)

/**
 * A deterministic hash over exactly the historically-meaningful fields that
 * define a version (ADR-006) -- not source_metadata, which is supplementary
 * debug context and must not by itself trigger a new version.
 */
export function computeContentHash(listing: NormalizedListing): string {
  const parts = [
    listing.title,
    listing.organization,
    listing.description,
    listing.locationText ?? '',
    listing.remoteMode,
    listing.opportunityKind,
    listing.employmentType,
    listing.applicationUrl ?? '',
    listing.applicationDeadline ?? '',
    listing.postedAt ?? '',
  ]
  return createHash('sha256')
    .update(parts.join(HASH_FIELD_SEPARATOR))
    .digest('hex')
}
