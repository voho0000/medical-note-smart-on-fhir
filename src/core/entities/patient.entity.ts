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
  /** Present only when the App has overlaid locally-entered SDK demographics.
   * The source FHIR Patient remains unchanged in the encrypted Bundle. */
  demographicsSource?: 'user-entered-local-profile'
  userEnteredDemographicFields?: PatientDemographicField[]
}

export type PatientDemographicField = 'name' | 'gender' | 'birthDate'

export interface UserEnteredPatientProfile {
  source: 'user-entered'
  name?: string
  gender?: 'male' | 'female' | 'other'
  birthDate?: string
  updatedAt: string
}

export interface UserEnteredPatientProfileInput {
  name?: string
  gender?: 'male' | 'female' | 'other'
  birthDate?: string
}

const PROFILE_GENDERS = new Set(['male', 'female', 'other'])
const FHIR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidPatientBirthDate(
  value: string,
  today = new Date(),
): boolean {
  if (!FHIR_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  if (parsed.toISOString().slice(0, 10) !== value) return false
  return value <= localDateString(today)
}

/** Build the only accepted shape for encrypted, user-entered demographics.
 * Empty strings are treated as "not supplied"; invalid dates fail closed. */
export function createUserEnteredPatientProfile(
  input: UserEnteredPatientProfileInput,
  now = new Date(),
): UserEnteredPatientProfile | null {
  const name = typeof input.name === 'string'
    ? input.name.trim().replace(/\s+/g, ' ').slice(0, 100)
    : ''
  const gender = PROFILE_GENDERS.has(input.gender ?? '')
    ? input.gender
    : undefined
  const birthDate = typeof input.birthDate === 'string' && input.birthDate.trim()
    ? input.birthDate.trim()
    : undefined

  if (birthDate && !isValidPatientBirthDate(birthDate, now)) {
    throw new Error('Invalid patient birth date')
  }
  if (!name && !gender && !birthDate) return null

  return {
    source: 'user-entered',
    ...(name ? { name } : {}),
    ...(gender ? { gender } : {}),
    ...(birthDate ? { birthDate } : {}),
    updatedAt: now.toISOString(),
  }
}

/** Parse untrusted decrypted storage without inventing or guessing values. */
export function parseUserEnteredPatientProfile(
  value: unknown,
): UserEnteredPatientProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<UserEnteredPatientProfile>
  if (candidate.source !== 'user-entered') return null
  if (
    typeof candidate.updatedAt !== 'string'
    || Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return null
  }
  try {
    const profile = createUserEnteredPatientProfile({
      name: candidate.name,
      gender: candidate.gender,
      birthDate: candidate.birthDate,
    }, new Date(candidate.updatedAt))
    return profile ? { ...profile, updatedAt: candidate.updatedAt } : null
  } catch {
    return null
  }
}

export function applyUserEnteredPatientProfile(
  patient: PatientEntity,
  profile: UserEnteredPatientProfile | null,
): PatientEntity {
  if (!profile) return patient

  const fields: PatientDemographicField[] = []
  const next: PatientEntity = { ...patient }
  if (profile.name) {
    next.name = [{ use: 'usual', text: profile.name }]
    fields.push('name')
  }
  if (profile.gender) {
    next.gender = profile.gender
    fields.push('gender')
  }
  if (profile.birthDate) {
    next.birthDate = profile.birthDate
    next.age = calculateAge(profile.birthDate) ?? undefined
    fields.push('birthDate')
  }
  next.demographicsSource = 'user-entered-local-profile'
  next.userEnteredDemographicFields = fields
  return next
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
