// Re-export from shared FHIR helpers
export {
  getCodeableConceptText,
  formatDate,
} from '@/src/shared/utils/fhir-helpers'

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
