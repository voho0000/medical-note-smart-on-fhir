// Re-export from shared FHIR helpers
export {
  getCodeableConceptText,
  formatDate,
} from '@/src/shared/utils/fhir-helpers'

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
