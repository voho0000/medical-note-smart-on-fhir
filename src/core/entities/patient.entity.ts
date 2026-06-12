// Core Domain Entity: Patient
//
// Kept intentionally loose on optional fields — TW Core IG Patient resources
// from TWCAT vendors carry useful demographic data (NI/MR identifiers,
// telecom, address, contact, communication) that the legacy 4-field display
// dropped. The display layer opts in to extra fields via a "show more"
// toggle so existing callers (medical-chat header, IPS export) stay quiet.
export interface PatientEntity {
  id: string
  resourceType: 'Patient'
  name?: {
    use?: string
    text?: string
    given?: string[]
    family?: string
  }[]
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  age?: number
  // Optional extended demographics (filled in by PatientMapper.toDomain).
  identifier?: {
    use?: string
    type?: { coding?: { system?: string; code?: string }[]; text?: string }
    system?: string
    value?: string
  }[]
  telecom?: {
    system?: string
    value?: string
    use?: string
  }[]
  address?: {
    use?: string
    text?: string
    line?: string[]
    city?: string
    district?: string
    state?: string
    postalCode?: string
    country?: string
  }[]
  maritalStatus?: {
    coding?: { system?: string; code?: string; display?: string }[]
    text?: string
  }
  communication?: {
    language?: { coding?: { system?: string; code?: string; display?: string }[]; text?: string }
    preferred?: boolean
  }[]
  contact?: {
    relationship?: { coding?: { system?: string; code?: string; display?: string }[]; text?: string }[]
    name?: { text?: string; given?: string[]; family?: string }
    telecom?: { system?: string; value?: string; use?: string }[]
  }[]
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
  // Prefer the official local-script name in `text` (TW Core / IPS put the
  // Chinese name there; given/family hold Pinyin). Mirrors patient-info's
  // formatName so a text-only name — legal FHIR, and exactly what our own IPS
  // export emits — never collapses to "Unknown Patient" on a round-trip.
  const text = patient.name.find((n) => n.text)?.text?.trim()
  if (text) return text
  const nameEntry = patient.name[0]
  const given = nameEntry.given?.join(' ')?.trim()
  const family = nameEntry.family?.trim()
  return [given, family].filter(Boolean).join(' ') || 'Unknown Patient'
}
