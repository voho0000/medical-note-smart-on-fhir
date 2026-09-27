// Defensive extraction of JSON from raw LLM output — the single shared
// implementation (formerly copy-pasted in the medical-summary, safety-alerts
// and report-interpretation use-cases, with the richest version living in
// features/ips-export/utils/llm-json.ts, which now re-exports from here).
//
// JSON mode is best-effort: proxies may drop the response_format flag, and
// models occasionally wrap JSON in prose or markdown fences, or emit trailing
// commas. This module extracts the payload, repairs the common slips, and
// leaves schema validation to the caller.

/** Thrown when no JSON object/array can be extracted from the model output. */
export class LlmJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmJsonError'
  }
}

/**
 * Pull a JSON value out of a raw model response. Handles markdown code fences
 * and leading/trailing prose (object OR array top level), and retries once
 * after stripping trailing commas. Returns the parsed value.
 * Throws `LlmJsonError` on failure — use {@link tryExtractJsonValue} for a
 * null-returning variant.
 */
export function extractJsonObject(raw: string): unknown {
  if (!raw || typeof raw !== 'string') {
    throw new LlmJsonError('Empty model response')
  }

  let s = raw.trim()

  // Strip a fenced ```json … ``` / ``` … ``` block, keeping the inner content.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) s = fence[1].trim()

  // Slice from the first opening bracket to the last closing bracket so
  // surrounding prose ("Here is the JSON: { … }") doesn't break JSON.parse.
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr)
  const lastObj = s.lastIndexOf('}')
  const lastArr = s.lastIndexOf(']')
  const end = Math.max(lastObj, lastArr)
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1)
  }

  try {
    return JSON.parse(s)
  } catch {
    // Repairs run only after a strict parse failed, cheapest first:
    // 1. trailing commas before } or ];
    // 2. common local-model slips: a key missing its colon
    //    (`"trend "8.2%"`) and an unescaped quote copied from a record inside a
    //    string value (`… "X.R." …`);
    // 3. one or two omitted/extra closing brackets at the very end.
    const withoutTrailingCommas = s.replace(/,\s*([}\]])/g, '$1')
    const candidates = [withoutTrailingCommas]
    const structural = escapeInteriorQuotes(insertMissingKeyColons(withoutTrailingCommas))
    if (structural !== withoutTrailingCommas) candidates.push(structural)
    for (const candidate of candidates) {
      for (const attempt of [candidate, balanceTrailingBrackets(candidate)]) {
        if (attempt === null) continue
        try {
          return JSON.parse(attempt)
        } catch {
          // try the next repair
        }
      }
    }
    throw new LlmJsonError('Model response was not valid JSON')
  }
}

const MAX_TRAILING_BRACKET_REPAIRS = 2

/**
 * Close up to two omitted final brackets, or drop up to two surplus final
 * brackets. Only when every string is terminated and the text ends on a
 * closer, so a reply truncated mid-value is still rejected rather than
 * silently shortened; a mismatched closer anywhere else is never repaired.
 */
function balanceTrailingBrackets(s: string): string | null {
  const trimmed = s.trimEnd()
  if (!/[}\]]$/.test(trimmed)) return null
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      if (stack.length === 0) {
        // Surplus closers are repairable only as a short run at the very end.
        const rest = trimmed.slice(i)
        if (!/^[\s}\]]*$/.test(rest) || rest.replace(/\s/g, '').length > MAX_TRAILING_BRACKET_REPAIRS) return null
        return trimmed.slice(0, i).trimEnd()
      }
      if (stack.pop() !== ch) return null
    }
  }
  if (inString || stack.length === 0 || stack.length > MAX_TRAILING_BRACKET_REPAIRS) return null
  return trimmed + stack.reverse().join('')
}

/** `{"trend "8.2%"` → `{"trend": "8.2%"`: an identifier key directly followed by a value quote. */
function insertMissingKeyColons(s: string): string {
  return s.replace(/([{,]\s*)"([A-Za-z_][A-Za-z0-9_]*)\s+"/g, '$1"$2": "')
}

/**
 * Escape a `"` inside a string value when it cannot be the closing quote,
 * i.e. the next non-space character is not `,`, `:`, `}` or `]`.
 */
function escapeInteriorQuotes(s: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (escaped) {
      escaped = false
      out += ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      out += ch
      continue
    }
    if (ch === '"') {
      const next = s.slice(i + 1).match(/^\s*(.)/)?.[1]
      if (next === undefined || /[,:}\]]/.test(next)) {
        inString = false
        out += ch
      } else {
        out += '\\"'
      }
      continue
    }
    out += ch
  }
  return out
}

/** Null-returning variant of {@link extractJsonObject} for parse-or-null flows. */
export function tryExtractJsonValue(raw: string): unknown | null {
  try {
    return extractJsonObject(raw)
  } catch {
    return null
  }
}
