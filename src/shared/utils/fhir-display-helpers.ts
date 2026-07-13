// FHIR display / prescription helpers shared across features (audit C3 —
// formerly under features/clinical-summary, but ips-export and the
// application-layer context hooks need them too).
export {
  getCodeableConceptText,
  formatDate,
} from './fhir-helpers'

/**
 * Locale + audience-aware text resolution for a FHIR CodeableConcept.
 *
 * Used for clinician-vs-patient terminology choices like drug names and
 * billing-ICD descriptions.
 *
 * Bridge contract (NHI-FHIR-Bridge v0.6.10+):
 *   - `text`              localized (zh-TW) display string
 *   - `coding[].display`  canonical English label
 *
 * Resolution rules:
 *   locale === 'en'                  → always English (coding[].display)
 *   locale === 'zh-TW' & medical    → English (coding) — pharmacology habit
 *   locale === 'zh-TW' & patient    → 中文 (text) — friendlier for laypeople
 *
 * In other words: switching the UI language to English forces English
 * everywhere; only the Chinese UI lets audience decide.
 *
 * Returns '' when nothing usable is present.
 */
export function pickLocalizedText(
  concept: any,
  audience: 'medical' | 'patient',
  locale: string = 'zh-TW',
): string {
  if (!concept) return ''
  const text = typeof concept.text === 'string' ? concept.text.trim() : ''
  const coded = concept.coding?.[0]?.display
  const codedStr = typeof coded === 'string' ? coded.trim() : ''
  // English UI: force English regardless of audience.
  if (locale === 'en') {
    return codedStr || text || ''
  }
  // Non-English UI: audience selects technical (English) vs friendly (中文).
  if (audience === 'patient') {
    return text || codedStr || ''
  }
  return codedStr || text || ''
}

/**
 * Locale-aware text resolution for a FHIR CodeableConcept.
 *
 * Used for descriptive labels where the choice should follow the UI
 * language, not the audience — e.g. drug categories ("降血壓藥" /
 * "HYPOTENSIVE AGENTS"). Medical professionals reading a Chinese-language
 * UI still want "降血壓藥" because it's a descriptor, not a technical
 * pharmacology identifier.
 *
 *   locale === 'en' → prefer English coding[].display, fall back to text
 *   locale otherwise (zh-TW / default) → prefer 中文 text, fall back to coding
 *
 * Returns '' when nothing usable is present.
 */
export function pickByLocale(concept: any, locale: string): string {
  if (!concept) return ''
  const text = typeof concept.text === 'string' ? concept.text.trim() : ''
  const coded = concept.coding?.[0]?.display
  const codedStr = typeof coded === 'string' ? coded.trim() : ''
  if (locale === 'en') {
    return codedStr || text || ''
  }
  return text || codedStr || ''
}

/**
 * Medication name sent to AI features.
 *
 * The bridge's `coding[].display` is the canonical English label and proved
 * materially easier for the model to map to ingredients / pharmacologic
 * classes than the localized zh-TW brand name in `text`. Keep this independent
 * of UI locale and audience so summary, insights, safety, and agent tools all
 * see the same drug identifier. Source text remains the fallback for bundles
 * that do not provide an English display.
 */
export function pickAiMedicationName(
  concept: any,
  referenceDisplay?: string,
): string {
  const coded = concept?.coding?.find(
    (coding: any) => typeof coding?.display === 'string' && coding.display.trim().length > 0,
  )?.display?.trim()
  const text = typeof concept?.text === 'string' ? concept.text.trim() : ''
  const reference = typeof referenceDisplay === 'string' ? referenceDisplay.trim() : ''
  return coded || text || reference || ''
}

/**
 * Returns true when the MedicationRequest's FHIR `courseOfTherapyType` marks
 * this order as a continuous / long-term therapy — i.e. the bridge classified
 * it as a NHI 慢性處方箋 (refillable chronic prescription).
 *
 * Bridge contract: NHI-FHIR-Bridge v0.6.10+ sets
 *   courseOfTherapyType.coding[].code === "continuous"
 *   (system http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy)
 * Acute orders simply omit the field — treat that as non-chronic.
 *
 * We also accept the `text` field "Continuous long term therapy" as a fallback
 * since the bridge populates both. Loose code match (no system check) is
 * intentional — matches the bridge's own recommended detection snippet.
 */
export function isChronicPrescription(med: any): boolean {
  const cot = med?.courseOfTherapyType
  if (!cot) return false
  if (Array.isArray(cot.coding) && cot.coding.some((c: any) => c?.code === 'continuous')) {
    return true
  }
  if (typeof cot.text === 'string' && /continuous/i.test(cot.text)) return true
  return false
}

// Medication-specific helper
export function extractFrequencyFromText(text?: string): string {
  if (!text) return ""
  const upper = text.toUpperCase()
  const known = upper.match(/\b(QD|BID|TID|QID|QOD|QHS|HS|PRN)\b/)
  if (known) return known[1]
  const every = upper.match(/Q(\d+)H/)
  if (every) return `q${every[1]}h`
  const everyHours = text.match(/every\s+(\d+)\s*hour/i)
  if (everyHours) return `q${everyHours[1]}h`
  const perDay = text.match(/(\d+)\s*(?:times|x)\s*(?:per|\/)?\s*day/i)
  if (perDay) return `${perDay[1]}×/day`
  return ""
}
