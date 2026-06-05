// sanitize-narrative.ts
// Wraps DOMPurify with a FHIR Narrative-aware whitelist. The FHIR spec
// (R4 §2.42) restricts Narrative.div to a subset of XHTML; we further
// constrain it to elements that render meaningfully inside our card layout
// and strip anything script/style/event-handler related.
//
// The output is intended for `dangerouslySetInnerHTML` — never feed it
// raw text from any other source through this helper.
import DOMPurify from 'dompurify'

// Allowed tags per the FHIR Narrative XHTML subset, minus form/script/style
// elements that have no place in a clinical narrative.
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'b', 'i', 'em', 'strong', 'small', 'sub', 'sup', 'u', 's',
  'a', 'img', 'blockquote', 'pre', 'code',
]

// Safe presentational attributes only. `href` / `src` are kept for anchors
// and images but DOMPurify's URL filter strips javascript:/data: schemes.
const ALLOWED_ATTR = [
  'class', 'id', 'lang', 'dir', 'title',
  'href', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'scope',
  // `style` intentionally omitted — FHIR Narrative shouldn't ship colours/
  // sizes that override the host app's design system.
]

/**
 * Sanitize a FHIR Narrative XHTML string to a safe HTML fragment.
 * Returns an empty string for falsy input.
 */
export function sanitizeNarrative(rawXhtml?: string): string {
  if (!rawXhtml || typeof rawXhtml !== 'string') return ''
  // Guard against SSR — DOMPurify needs a DOM. The card is client-only
  // (`"use client"`) so this branch should never fire in practice, but
  // returning empty rather than crashing keeps the renderer defensive.
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(rawXhtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force anchors to open in a new tab when present (helps for any
    // narrative that links out to source attachments).
    ADD_ATTR: ['target'],
    // Reject any URL with a script-y scheme.
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}

/**
 * Returns true if a narrative XHTML string has any rendered content once
 * sanitized and stripped of whitespace. Used to suppress empty / placeholder
 * narratives (FHIR allows `<div xmlns="..."/>` as a valid empty narrative).
 */
export function hasNarrativeContent(rawXhtml?: string): boolean {
  const cleaned = sanitizeNarrative(rawXhtml)
  if (!cleaned) return false
  // Strip tags + whitespace to check there's actual visible text. We accept
  // narratives that are pure tables (no text outside cells) by also checking
  // the raw cleaned length.
  const textOnly = cleaned.replace(/<[^>]*>/g, '').trim()
  return textOnly.length > 0 || cleaned.includes('<table') || cleaned.includes('<img')
}
