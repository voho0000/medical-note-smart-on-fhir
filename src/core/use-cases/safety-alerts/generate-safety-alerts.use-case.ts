// Use Case: Generate Proactive Safety Alerts (pure AI, structured output).
// Builds a JSON-only prompt and parses/validates the model's reply into the
// fixed SafetyScanResult shape. No state, no framework — unit-testable.
import type { AiMessage } from '@/src/core/entities/ai.entity'
import {
  SafetyScanResultSchema,
  normaliseCategory,
  type SafetyScanResult,
} from '@/src/core/entities/safety-alert.entity'

// Gemini Flash-Lite won the head-to-head eval (clean JSON, caught all risk
// categories, fast, cheap, 900K context for big bundles) — pin it so this
// background scan doesn't ride the user's possibly-slow chat model (e.g. nano).
export const SAFETY_ALERTS_MODEL_ID = 'gemini-3.1-flash-lite'

const SCHEMA_HINT =
  '{"scannedCount": <number of records scanned>, "alerts": [{' +
  '"severity": "high|medium|low", ' +
  '"title": "<short title>", ' +
  '"detail": "<one sentence, MUST cite the actual value>", ' +
  '"evidence": ["<triggering data item>"], ' +
  '"category": "renal|bleeding|critical-lab|duplicate|allergy|monitoring|other", ' +
  '"recommendation": "<optional next step>"}]}'

const SYSTEM_BASE =
  'You are a clinical medication-safety reviewer for healthcare professionals. ' +
  'Scan the patient data for potential safety risks across these categories: ' +
  'drug–renal dosing, bleeding / multiple antithrombotics, critical lab values, ' +
  'duplicate therapy, drug–allergy conflicts, and missing monitoring. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  SCHEMA_HINT +
  '\n\nRules: ' +
  'Do NOT fabricate values — use only values present in the data, and put the triggering items in "evidence". ' +
  'If there are no risks, return an empty "alerts" array. ' +
  'Order alerts by severity (high first). ' +
  'Keep each title under ~12 words and each detail to one concise sentence.'

export interface GenerateSafetyAlertsInput {
  clinicalContext: string
  locale: 'en' | 'zh-TW'
}

export class GenerateSafetyAlertsUseCase {
  buildMessages(input: GenerateSafetyAlertsInput): AiMessage[] {
    const lang =
      input.locale === 'zh-TW'
        ? '\n\nWrite every "title", "detail", "evidence" and "recommendation" value in Traditional Chinese (繁體中文).'
        : '\n\nWrite all values in English.'
    return [
      { role: 'system', content: SYSTEM_BASE + lang },
      {
        role: 'user',
        content: `Patient clinical data:\n${input.clinicalContext}`,
      },
    ]
  }

  /**
   * Parse the model's reply into a validated SafetyScanResult, or null if it
   * isn't usable JSON / fails schema validation. Strips ```json fences and any
   * prose around the outermost JSON object.
   */
  parseScanResult(text: string): SafetyScanResult | null {
    const json = extractJsonObject(text)
    if (!json) return null
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      return null
    }
    const parsed = SafetyScanResultSchema.safeParse(raw)
    if (!parsed.success) return null

    return {
      scannedCount: parsed.data.scannedCount,
      alerts: parsed.data.alerts.map((a, i) => ({
        ...a,
        id: `sa-${i}`,
        category: normaliseCategory(a.category),
      })),
    }
  }
}

/** Pull the outermost {...} out of a reply that may have fences/prose around it. */
function extractJsonObject(text: string): string | null {
  if (!text) return null
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return stripped.slice(start, end + 1)
}

export const generateSafetyAlertsUseCase = new GenerateSafetyAlertsUseCase()
