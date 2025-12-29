export { calculateAge, formatGender, formatError } from '@/src/shared/utils/fhir-helpers'

export function formatName(patient: any): string {
  if (!patient?.name?.[0]) return "N/A"
  const name = patient.name[0]
  const givenName = name.given?.join(" ")
  const familyName = name.family
  
  // Build full name from parts
  const parts = []
  if (givenName) parts.push(givenName.trim())
  if (familyName) parts.push(familyName.trim())
  
  return parts.length > 0 ? parts.join(" ") : "N/A"
}
