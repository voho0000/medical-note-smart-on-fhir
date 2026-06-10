export { calculateAge, formatGender, formatError } from '@/src/shared/utils/fhir-helpers'

// Translation type — narrowed to the keys these helpers read so we don't
// require the full i18n type tree. Both zh-TW and en supply these.
export type PatientI18n = {
  nationalId: string
  medicalRecordNumber: string
  passportNumber: string
  socialSecurityNumber: string
  identifierGeneric: string
  phone: string
  email: string
  fax: string
  sms: string
  contactGeneric: string
  married: string
  single: string
  divorced: string
  widowed: string
  separated: string
  languageZhTW: string
  languageZhCN: string
  languageEn: string
  languageJa: string
  relationshipFather: string
  relationshipMother: string
  relationshipSpouse: string
  relationshipSibling: string
  relationshipChild: string
  relationshipGuardian: string
  relationshipEmergency: string
}

export function formatName(patient: any): string {
  if (!patient?.name?.[0]) return "N/A"
  // Prefer the official local-script name first (TW Core IG fills
  // `text` with the Chinese name and given/family with Pinyin).
  const cn = patient.name.find((n: any) => n.text)?.text?.trim()
  if (cn) return cn
  const name = patient.name[0]
  const givenName = name.given?.join(" ")
  const familyName = name.family
  const parts: string[] = []
  if (givenName) parts.push(givenName.trim())
  if (familyName) parts.push(familyName.trim())
  return parts.length > 0 ? parts.join(" ") : "N/A"
}

// ---------------------------------------------------------------------------
// Extended demographics — for the "Show more" details toggle.
// Each helper takes the relevant `t.patient` strings so callers in any
// locale render the right labels without code duplication.
// ---------------------------------------------------------------------------

type IdT = Pick<
  PatientI18n,
  'nationalId' | 'medicalRecordNumber' | 'passportNumber' | 'socialSecurityNumber' | 'identifierGeneric'
>

export function formatIdentifiers(
  patient: any,
  t: IdT
): Array<{ label: string; value: string }> {
  if (!Array.isArray(patient?.identifier)) return []
  const codeLabel: Record<string, string> = {
    NNxxx: t.nationalId,
    NI: t.nationalId,
    MR: t.medicalRecordNumber,
    PPN: t.passportNumber,
    SS: t.socialSecurityNumber,
  }
  return patient.identifier
    .map((id: any) => {
      const code = id?.type?.coding?.[0]?.code
      const label = (code && codeLabel[code]) || id?.type?.text || id?.system || t.identifierGeneric
      return id?.value ? { label, value: id.value } : null
    })
    .filter(Boolean) as Array<{ label: string; value: string }>
}

type TelecomT = Pick<PatientI18n, 'phone' | 'email' | 'fax' | 'sms' | 'contactGeneric'>

export function formatTelecom(
  patient: any,
  t: TelecomT
): Array<{ label: string; value: string }> {
  if (!Array.isArray(patient?.telecom)) return []
  const sysLabel: Record<string, string> = {
    phone: t.phone,
    email: t.email,
    fax: t.fax,
    sms: t.sms,
  }
  return patient.telecom
    .map((tel: any) => {
      if (!tel?.value) return null
      const sys = (tel.system || '').toLowerCase()
      const label = sysLabel[sys] || sys || t.contactGeneric
      const use = tel.use ? `（${tel.use}）` : ''
      return { label: `${label}${use}`, value: tel.value }
    })
    .filter(Boolean) as Array<{ label: string; value: string }>
}

export function formatAddresses(patient: any): string[] {
  if (!Array.isArray(patient?.address)) return []
  return patient.address
    .map((a: any) => {
      if (a?.text) return a.text
      const parts: string[] = []
      if (a?.postalCode) parts.push(a.postalCode)
      if (a?.country) parts.push(a.country)
      if (a?.state) parts.push(a.state)
      if (a?.district) parts.push(a.district)
      if (a?.city) parts.push(a.city)
      if (Array.isArray(a?.line)) parts.push(...a.line)
      return parts.filter(Boolean).join(' ')
    })
    .filter((s: string) => s && s.length > 0)
}

type MaritalT = Pick<PatientI18n, 'married' | 'single' | 'divorced' | 'widowed' | 'separated'>

export function formatMaritalStatus(patient: any, t: MaritalT): string | undefined {
  const m = patient?.maritalStatus
  if (!m) return undefined
  if (m.text) return m.text
  const code = m.coding?.[0]?.code
  const display = m.coding?.[0]?.display
  const codeMap: Record<string, string> = {
    M: t.married,
    S: t.single,
    U: t.single,
    D: t.divorced,
    W: t.widowed,
    L: t.separated,
  }
  return display || (code && codeMap[code]) || code
}

type LangT = Pick<PatientI18n, 'languageZhTW' | 'languageZhCN' | 'languageEn' | 'languageJa'>

export function formatLanguages(patient: any, t: LangT): string[] {
  if (!Array.isArray(patient?.communication)) return []
  const codeMap: Record<string, string> = {
    'zh-TW': t.languageZhTW,
    'zh-CN': t.languageZhCN,
    en: t.languageEn,
    ja: t.languageJa,
  }
  return patient.communication
    .map((c: any) => {
      const code = c?.language?.coding?.[0]?.code
      const display = c?.language?.coding?.[0]?.display || c?.language?.text
      return display || (code && codeMap[code]) || code
    })
    .filter(Boolean) as string[]
}

type RelT = Pick<
  PatientI18n,
  'relationshipFather' | 'relationshipMother' | 'relationshipSpouse' | 'relationshipSibling'
  | 'relationshipChild' | 'relationshipGuardian' | 'relationshipEmergency' | 'contactGeneric'
>

export function formatContacts(
  patient: any,
  t: RelT
): Array<{ relationship: string; name: string; phone?: string }> {
  if (!Array.isArray(patient?.contact)) return []
  const codeMap: Record<string, string> = {
    FTH: t.relationshipFather,
    MTH: t.relationshipMother,
    SPS: t.relationshipSpouse,
    SIB: t.relationshipSibling,
    CHILD: t.relationshipChild,
    GUARD: t.relationshipGuardian,
    EMC: t.relationshipEmergency,
  }
  return patient.contact
    .map((c: any) => {
      const code = c?.relationship?.[0]?.coding?.[0]?.code
      const text = c?.relationship?.[0]?.text
      const relationship =
        text || (code && codeMap[code]) || code || t.contactGeneric
      const name = c?.name?.text || [c?.name?.given?.join(' '), c?.name?.family].filter(Boolean).join(' ')
      const phone = c?.telecom?.find((tel: any) => (tel.system || '').toLowerCase() === 'phone')?.value
      if (!name) return null
      return { relationship, name, phone }
    })
    .filter(Boolean) as Array<{ relationship: string; name: string; phone?: string }>
}
