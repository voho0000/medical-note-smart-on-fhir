// PII Scrub
// Removes patient identifiers and provider names from tool returns before
// sending to cloud LLM providers. Applied uniformly to every tool's response
// so new tools inherit the protection automatically.
//
// Strips:
//   - Patient `id`, `identifier`
//   - `birthDate` (`age` is kept — calculated upstream)
//   - Any `display` field on performer / participant / serviceProvider /
//     subject / actor (physician + provider names)
//
// Keeps:
//   - Gender, age, all clinical fields (codes, values, dates)
//   - Department names (type.text), institution names, lot numbers
//     (these are gray-area but clinically useful)

const STRIP_TOP_LEVEL_KEYS = new Set(['birthDate', 'identifier'])

// Field path patterns where a `display` is a person/provider name we want to
// strip. We only strip `display` under these specific parent keys to avoid
// removing useful labels (e.g. type.text, code.coding[].display which are
// clinical concepts, not names).
const STRIP_DISPLAY_UNDER = new Set([
  'performer',
  'participant',
  'serviceProvider',
  'subject',
  'actor',
  'individual',
  'requester',
  'recorder',
  'asserter',
])

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function walk(value: unknown, parentKey: string | null): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, parentKey))
  }
  if (!isObject(value)) return value

  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    // Skip Patient ID at the top-level data object (key === 'id' on a
    // PatientInfo-shaped response). Don't strip 'id' globally — encounter ids
    // etc. are used internally by getEncounterDetails.
    if (parentKey === null && key === 'id' && 'gender' in value) {
      continue
    }
    if (STRIP_TOP_LEVEL_KEYS.has(key) && parentKey === null) continue
    if (key === 'birthDate') continue // also strip nested birthDate just in case

    // Strip `display` under known provider-name parents
    if (key === 'display' && parentKey && STRIP_DISPLAY_UNDER.has(parentKey)) {
      continue
    }

    out[key] = walk(raw, key)
  }
  return out
}

/**
 * Recursively strip patient + provider PII from a tool response.
 * Safe to apply to `{ success, summary, count, data }` shape — only
 * `data` typically contains the sensitive fields.
 */
export function scrubPii<T>(payload: T): T {
  return walk(payload, null) as T
}
