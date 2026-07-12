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
    // One repair pass: remove trailing commas before } or ].
    const repaired = s.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(repaired)
    } catch {
      throw new LlmJsonError('Model response was not valid JSON')
    }
  }
}

/** Null-returning variant of {@link extractJsonObject} for parse-or-null flows. */
export function tryExtractJsonValue(raw: string): unknown | null {
  try {
    return extractJsonObject(raw)
  } catch {
    return null
  }
}
