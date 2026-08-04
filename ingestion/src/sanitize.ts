import sanitizeHtml from 'sanitize-html'
import { decodeHTML } from 'entities'

// Allowlist per docs/INGESTION_ARCHITECTURE.md #7. Everything else --
// <script>, <style>, <iframe>, <object>, <embed>, <form>, <input>, <img>
// (removes tracking pixels), every on* handler, every style/data-*
// attribute, all comments -- is unconditionally stripped by omission.
const ALLOWED_TAGS = [
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
]

function sanitizeToAllowedHtml(rawHtml: string): string {
  // Decode entities once before parsing as HTML -- some sources (observably
  // Greenhouse) double-encode their content field, so what arrives over the
  // API is literal text like "&amp;lt;p&amp;gt;" / "&lt;p&gt;" rather than
  // real "<p>" markup. Decoding once turns genuine markup back into
  // structure a parser can recognize; for an already-correctly-encoded
  // source this is a harmless no-op on real tags and only resolves ordinary
  // inline entities (&amp;, &nbsp;, etc.) a touch earlier than sanitize-html
  // would have anyway.
  const decodedOnce = decodeHTML(rawHtml)
  return sanitizeHtml(decodedOnce, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https', 'mailto'],
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'textarea', 'option'],
  })
}

// Plain text is derived from the *sanitized* tree, never the raw string --
// deriving it from raw text first could let stripped-tag content leak back
// in (docs/INGESTION_ARCHITECTURE.md #7).
function sanitizedHtmlToPlainText(sanitizedHtml: string): string {
  const withLineBreaks = sanitizedHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h3|h4|h5|h6)>/gi, '\n')
  const stripped = sanitizeHtml(withLineBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  })
  return stripped
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Sanitizes untrusted third-party HTML into safe, plain text, preserving
 * paragraph/list-item line breaks reasonably. This is the only form of a
 * posting description that is ever stored or rendered -- the raw response is
 * discarded after this step (docs/SECURITY_AND_PRIVACY.md #6).
 */
export function sanitizeDescription(rawHtml: string): string {
  return sanitizedHtmlToPlainText(sanitizeToAllowedHtml(rawHtml))
}
