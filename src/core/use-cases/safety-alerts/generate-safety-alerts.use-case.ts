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

// Healthcare-professional version: clinical risk language (eGFR, dosing
// thresholds, monitoring gaps).
const SYSTEM_MEDICAL =
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

// Patient version: same underlying analysis, but reframed as plain-language,
// actionable health reminders — what to follow up on, WHICH kind of doctor to
// see, and simple lifestyle/self-care tips. Never tells the patient to change
// their own medicines.
const SYSTEM_PATIENT =
  'You are giving a patient (a layperson, NOT a clinician) plain-language health reminders based on THEIR OWN records. ' +
  'Review the same areas a safety check would — kidney-related medicine doses, bleeding risk / multiple blood thinners, ' +
  'abnormal lab values, duplicate medicines, drug–allergy conflicts, and missing monitoring — but frame each as a ' +
  'calm, actionable reminder, not a clinical alarm. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  SCHEMA_HINT +
  '\n\nRules: ' +
  'Write in plain, everyday language; avoid medical jargon, or briefly explain any necessary term. ' +
  'Each "title" is a short, reassuring heading. Each "detail" explains the point in ONE sentence and still mentions the actual value from the data. ' +
  'Each "recommendation" gives a concrete next step: when relevant, WHICH type of doctor / specialty to follow up with ' +
  '(e.g. kidney → nephrology, heart → cardiology), and/or a simple lifestyle or self-care suggestion (diet, activity, regular monitoring). ' +
  'NEVER tell the patient to start, stop, or change any medicine on their own — always say to confirm with their own doctor or pharmacist. ' +
  'Do not alarm: these are things to discuss and habits to consider, not diagnoses. ' +
  'Do NOT fabricate values — use only values present in the data, and put the triggering items in "evidence". ' +
  'If there is nothing worth noting, return an empty "alerts" array. ' +
  'Order by importance (most important first). Keep each title short and each detail to one concise sentence.'

export interface GenerateSafetyAlertsInput {
  clinicalContext: string
  locale: 'en' | 'zh-TW'
  /** Tailors the prompt: clinician-facing risks vs patient-facing reminders. */
  audience?: 'medical' | 'patient'
}

export class GenerateSafetyAlertsUseCase {
  buildMessages(input: GenerateSafetyAlertsInput): AiMessage[] {
    const system = input.audience === 'patient' ? SYSTEM_PATIENT : SYSTEM_MEDICAL
    const lang =
      input.locale === 'zh-TW'
        ? '\n\nWrite every "title", "detail", "evidence" and "recommendation" value in Traditional Chinese (繁體中文).'
        : '\n\nWrite all values in English.'
    return [
      { role: 'system', content: system + lang },
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
