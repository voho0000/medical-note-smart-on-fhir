// IPS Phase 2.2 — defensive parsing of the LLM's JSON inference output.
//
// JSON mode is best-effort (proxies may drop the response_format flag, and models
// occasionally wrap JSON in prose or markdown fences). This module is the safety
// net: it extracts the JSON payload, repairs the one common syntax slip (trailing
// commas), validates each candidate against a zod schema, and DROPS malformed
// rows rather than failing the whole batch. Total failure → [].

import { z } from 'zod'

/** Thrown when no JSON object/array can be extracted from the model output. */
export class LlmJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmJsonError'
  }
}

/**
 * Pull a JSON value out of a raw model response. Handles markdown code fences and
 * leading/trailing prose, and retries once after stripping trailing commas.
 * Returns the parsed value (object or array). Throws `LlmJsonError` on failure.
 */
export function extractJsonObject(raw: string): unknown {
  if (!raw || typeof raw !== 'string') {
    throw new LlmJsonError('Empty model response')
  }

  let s = raw.trim()

  // Strip a fenced ```json … ``` / ``` … ``` block, keeping the inner content.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) s = fence[1].trim()

  // Slice from the first opening bracket to the last matching closing bracket so
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

const EvidenceSchema = z.object({
  kind: z
    .enum(['encounter-icd', 'medication', 'discharge-excerpt', 'lab', 'composition'])
    .optional(),
  label: z.string().optional(),
  sourceId: z.string().optional(),
  icd10: z.string().optional(),
  date: z.string().optional(),
  count: z.number().optional(),
})

const SuggestedSnomedSchema = z.object({
  code: z.string(),
  display: z.string().optional(),
})

/** Schema for one candidate problem as the LLM is asked to return it. */
const ProblemRawSchema = z.object({
  labelZh: z.string().optional().default(''),
  labelEn: z.string().optional().default(''),
  inferenceConfidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  /** ICD-10 the model found in the evidence (feeds Strategy B). */
  evidenceIcd10: z.string().optional(),
  /** SNOMED the model picked — MUST be from the allowlist or null (validated later). */
  suggestedSnomed: SuggestedSnomedSchema.nullish(),
  supportingEvidence: z.array(EvidenceSchema).optional().default([]),
  rationale: z.string().optional(),
})

export type InferredProblemRaw = z.infer<typeof ProblemRawSchema>

/** Find the candidate array inside whatever top-level shape the model returned. */
function extractProblemArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.problems)) return obj.problems
    // Fall back to the first array-valued property.
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v
    }
  }
  return []
}

/**
 * Parse + validate the model's inference output into clean candidate rows.
 * Never throws on a single bad row (it is dropped); returns [] if nothing usable
 * (including when extraction fails entirely).
 */
export function parseInferenceResponse(raw: string): InferredProblemRaw[] {
  let parsed: unknown
  try {
    parsed = extractJsonObject(raw)
  } catch {
    return []
  }

  const rows = extractProblemArray(parsed)
  const out: InferredProblemRaw[] = []
  for (const row of rows) {
    const result = ProblemRawSchema.safeParse(row)
    if (!result.success) continue
    const p = result.data
    // A candidate with no label of any kind is unusable.
    if (!p.labelZh.trim() && !p.labelEn.trim()) continue
    out.push(p)
  }
  return out
}
