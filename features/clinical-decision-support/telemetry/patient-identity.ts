import { isDeidentifiedPatient, type PatientEntity } from '@/src/core/entities/patient.entity'

const MASK = /[Xx*＊○〇●Ｏ◯]/u
const MASKED_NATIONAL_ID = /^[A-Z][0-9X*＊○〇●Ｏ◯]{9}$/u
const NATIONAL_ID_SYSTEM = /national[-_]?id/i
const BIRTH_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizedName(patient: PatientEntity): string {
  if ((patient.name ?? []).some(name => MASK.test(name.text ?? ''))) throw new Error('cdss_identity_unavailable')
  const names = (patient.name ?? [])
    .map((name) => name.text?.normalize('NFKC').trim().replace(/\s+/gu, ' '))
    .filter((name): name is string => Boolean(name))
  if (names.length !== 1 || Array.from(names[0]).length < 2 || MASK.test(names[0]) || /(?:\p{Script=Han}[Oo]|[Oo]\p{Script=Han})/u.test(names[0]) || /^(?:Unknown(?: Patient)?|DEID-.*)$/i.test(names[0])) {
    throw new Error('cdss_identity_unavailable')
  }
  return names[0]
}

function maskedName(name: string): string {
  const chars = Array.from(name)
  const visible = chars.map((char, index) => (
    index === 0 || (index === chars.length - 1 && chars.length > 2) || /\s/u.test(char)
      ? char : '○'
  ))
  return visible.join('')
}

export const VGH_MRN_SYSTEM = 'https://vghtpe.gov.tw/IdentifierSystem/patient-mrn'

function storageIdentifier(patient: PatientEntity): { system: string; value: string; masked: string } {
  // Prefer the hospital MRN even when an optional national ID is present:
  // a later capture missing that optional field must find the same history.
  if (patient.meta?.source?.normalize('NFKC').trim() === 'ehr-fhir-bridge/scraper') {
    const mrns = (patient.identifier ?? []).filter(id => id.system?.normalize('NFKC').trim() === 'urn:oid:his.patient.mrn')
    const value = mrns[0]?.value?.normalize('NFKC').trim() ?? ''
    if (mrns.length !== 1 || !/^\d{6,12}$/.test(value)) throw new Error('cdss_identity_unavailable')
    return { system: VGH_MRN_SYSTEM, value, masked: `MRN-${'X'.repeat(value.length - 2)}${value.slice(-2)}` }
  }
  const matches = (patient.identifier ?? [])
    .filter(id => NATIONAL_ID_SYSTEM.test(id.system?.normalize('NFKC').trim() ?? '') || id.system?.normalize('NFKC').trim() === 'urn:oid:tw.gov.id-number')
    .map(id => ({ system: id.system!.normalize('NFKC').trim(), value: id.value?.normalize('NFKC').trim().toUpperCase() ?? '' }))
  if (matches.length !== 1 || !MASKED_NATIONAL_ID.test(matches[0].value)) throw new Error('cdss_identity_unavailable')
  const identifier = matches[0]
  if (identifier.system === 'urn:oid:tw.gov.id-number') identifier.system = 'https://twcore.mohw.gov.tw/IdentifierSystem/national-id'
  if (MASK.test(identifier.value.slice(1))) return { ...identifier, masked: identifier.value }
  if (identifier.system !== 'https://twcore.mohw.gov.tw/IdentifierSystem/national-id'
    || !/^[A-Z][12]\d{8}$/.test(identifier.value)) throw new Error('cdss_identity_unavailable')
  return { ...identifier,
    masked: `${identifier.value.slice(0, 4)}XXXXXX` }
}

/** The identifying inputs exist only in this browser; only the digest and masked display fields leave it. */
export async function cdssPatientIdentity(patient: PatientEntity) {
  if (isDeidentifiedPatient(patient)) throw new Error('cdss_patient_deidentified')
  const name = normalizedName(patient)
  const birthDate = patient.birthDate?.trim() ?? ''
  const parsedBirthDate = Date.parse(birthDate)
  if (!BIRTH_DATE.test(birthDate) || Number.isNaN(parsedBirthDate)
    || new Date(parsedBirthDate).toISOString().slice(0, 10) !== birthDate) {
    throw new Error('cdss_identity_unavailable')
  }
  const identifier = storageIdentifier(patient)
  const version = MASK.test(identifier.value.slice(1)) ? 1 as const : 2 as const
  const canonical = JSON.stringify([version, 'vghtpe', name, birthDate, identifier.system, identifier.value])
  if (!crypto.subtle) throw new Error('cdss_crypto_unavailable')
  const bytes = new TextEncoder().encode(canonical)
  // New complete identifiers use a deliberately expensive deterministic KDF.
  // This is still a sensitive pseudonymous key, not anonymous data. Frozen
  // cloud v1 inputs keep their existing digest so stored history remains reachable.
  const digest = version === 1 ? await crypto.subtle.digest('SHA-256', bytes)
    : await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000,
      salt: new TextEncoder().encode('mediprisma-cdss-patient-key-v2') },
    await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']), 256)
  const patientKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return {
    patient_key_version: version,
    patient_key_sha256: patientKey,
    patient_identity: {
      name_masked: maskedName(name),
      birth_year: birthDate.slice(0, 4),
      identifier_masked: identifier.masked,
      identifier_system: identifier.system,
    },
  }
}
