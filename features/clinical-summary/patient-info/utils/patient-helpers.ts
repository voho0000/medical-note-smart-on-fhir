export { calculateAge, formatGender, formatError } from '@/src/shared/utils/fhir-helpers'

export function formatName(patient: any): string {
  if (!patient?.name?.[0]) return "N/A"
  const name = patient.name[0]
  const givenName = name.given?.join(" ").trim()
  const familyName = name.family?.trim() || ""
  return [givenName, familyName].filter(Boolean).join(" ") || "N/A"
}
