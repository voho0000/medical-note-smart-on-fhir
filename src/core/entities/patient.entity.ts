// Core Domain Entity: Patient
export interface PatientEntity {
  id: string
  resourceType: 'Patient'
  name?: {
    given?: string[]
    family?: string
  }[]
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  age?: number
}

export function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 ? age : null
}

export function getPatientDisplayName(patient: PatientEntity | null): string {
  if (!patient?.name?.[0]) return 'Unknown Patient'
  const nameEntry = patient.name[0]
  const given = nameEntry.given?.join(' ')?.trim()
  const family = nameEntry.family?.trim()
  return [given, family].filter(Boolean).join(' ') || 'Unknown Patient'
}
