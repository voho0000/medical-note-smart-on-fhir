import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { getEncounterKindCode } from '@/src/shared/utils/encounter-type.utils'

type DomainFilterableClinicalData = Partial<ClinicalDataCollection> & {
  encounters?: any[]
  procedures?: any[]
}

const REHABILITATION_TEXT =
  /(?:物理治療|復健(?:科|治療|處置|訓練)?|職能治療|語言治療|physical\s*therapy|physiotherap|occupational\s*therapy|rehabilitation)/i
const DENTAL_TEXT =
  /(?:牙科|牙醫|齒科|口腔|環口|洗牙|氟化物治療|dental|dentistry|endodont|periodont|orthodont|prosthodont)/i

const HL7_SERVICE_TYPE_SYSTEM = 'http://terminology.hl7.org/codesystem/service-type'
const SNOMED_CT_SYSTEM = 'http://snomed.info/sct'
const LEGACY_NHI_CLINICAL_SERVICE_DOMAIN_SYSTEM =
  'https://nhi-fhir-bridge.github.io/codesystem/clinical-service-domain'
const TW_CORE_DEPARTMENT_SYSTEMS = new Set([
  'https://twcore.mohw.gov.tw/ig/twcore/codesystem/medical-consultation-department-nhi-tw',
  'https://twcore.mohw.gov.tw/ig/twcore/codesystem/medical-treatment-department-nhi-tw',
])
const DENTAL_SERVICE_CODES = new Set(['87', '88', '89', '90', '91', '92', '93', '94'])
const TCM_SERVICE_CODES = new Set(['13', '18'])
const DENTAL_SNOMED_CODES = new Set([
  '722163006', '408441001', '408461007', '394608004', '394607009', '408465003',
])
const DENTAL_DEPARTMENT_CODES = new Set([
  '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', 'GA',
])

function normalizeCodeSystem(system: unknown): string {
  return String(system ?? '').replace(/\/+$/, '').toLowerCase()
}

function encounterCareDiscipline(encounter: any): 'western' | 'tcm' | 'dental' {
  const entries = Array.isArray(encounter?.serviceType)
    ? encounter.serviceType
    : [encounter?.serviceType]
  const codings = entries
    .filter(Boolean)
    .map((entry: any) => entry?.concept ?? entry)
    .flatMap((concept: any) => concept?.coding ?? [])

  const hasDiscipline = (discipline: 'tcm' | 'dental') => codings.some((coding: any) => {
    const system = normalizeCodeSystem(coding?.system)
    const code = String(coding?.code ?? '').toUpperCase()
    if (system === HL7_SERVICE_TYPE_SYSTEM) {
      return discipline === 'dental' ? DENTAL_SERVICE_CODES.has(code) : TCM_SERVICE_CODES.has(code)
    }
    if (system === SNOMED_CT_SYSTEM) {
      return discipline === 'dental' && DENTAL_SNOMED_CODES.has(code)
    }
    if (system === LEGACY_NHI_CLINICAL_SERVICE_DOMAIN_SYSTEM) {
      return discipline === 'tcm' && code === 'TRADITIONAL-CHINESE-MEDICINE'
    }
    if (TW_CORE_DEPARTMENT_SYSTEMS.has(system)) {
      return discipline === 'dental' ? DENTAL_DEPARTMENT_CODES.has(code) : code === '60'
    }
    return false
  })

  if (hasDiscipline('tcm')) return 'tcm'
  if (hasDiscipline('dental')) return 'dental'
  const kindCode = String(getEncounterKindCode(encounter) ?? '').toLowerCase()
  if (kindCode === 'tcm-outpatient') return 'tcm'
  if (kindCode === 'dental-outpatient') return 'dental'
  return 'western'
}

function conceptSearchText(concept: any): string {
  return [
    concept?.text,
    ...((concept?.coding ?? []).flatMap((coding: any) => [
      coding?.system,
      coding?.code,
      coding?.display,
    ])),
  ].filter(Boolean).join(' ')
}

function encounterSearchText(encounter: any): string {
  const serviceTypes = Array.isArray(encounter?.serviceType)
    ? encounter.serviceType
    : [encounter?.serviceType]
  return [
    ...serviceTypes.map((value: any) => conceptSearchText(value?.concept ?? value)),
    ...(encounter?.type ?? []).map(conceptSearchText),
    encounter?.serviceProvider?.display,
    ...(encounter?.location ?? []).map((value: any) => value?.location?.display),
  ].filter(Boolean).join(' ')
}

function procedureSearchText(procedure: any): string {
  return [conceptSearchText(procedure?.category), conceptSearchText(procedure?.code)]
    .filter(Boolean)
    .join(' ')
}

function encounterReferenceId(procedure: any): string | undefined {
  const reference = procedure?.encounter?.reference
  return typeof reference === 'string' ? reference.split('/').filter(Boolean).at(-1) : undefined
}

export function isAiExcludedRehabilitationProcedure(procedure: any): boolean {
  return REHABILITATION_TEXT.test(procedureSearchText(procedure))
}

export function isAiExcludedDentalProcedure(procedure: any): boolean {
  return DENTAL_TEXT.test(procedureSearchText(procedure))
}

function isAiExcludedEncounterByOwnFields(encounter: any): boolean {
  if (encounterCareDiscipline(encounter) !== 'western') return true
  return REHABILITATION_TEXT.test(encounterSearchText(encounter))
}

/**
 * Outbound-AI-only domain filter. The source collection used by the clinical
 * workspace remains unchanged. Dental, TCM, and rehabilitation encounters are
 * removed; dental/rehabilitation procedures are removed even when standalone.
 * A linked excluded procedure also removes its encounter so old encounters do
 * not survive after their only relevant content was filtered out.
 */
export function filterAiExcludedClinicalDomains<T extends DomainFilterableClinicalData>(
  input: T,
): T {
  const encounters = input.encounters ?? []
  const procedures = input.procedures ?? []
  const excludedEncounterIds = new Set(
    encounters
      .filter(isAiExcludedEncounterByOwnFields)
      .map((encounter) => encounter?.id)
      .filter(Boolean),
  )
  const excludedProcedures = new Set<any>()

  for (const procedure of procedures) {
    const excludedByContent = isAiExcludedDentalProcedure(procedure)
      || isAiExcludedRehabilitationProcedure(procedure)
    const linkedEncounterId = encounterReferenceId(procedure)
    if (excludedByContent) {
      excludedProcedures.add(procedure)
      if (linkedEncounterId) excludedEncounterIds.add(linkedEncounterId)
      continue
    }
    if (linkedEncounterId && excludedEncounterIds.has(linkedEncounterId)) {
      excludedProcedures.add(procedure)
    }
  }

  const filteredEncounters = encounters.filter(
    (encounter) => !encounter?.id || !excludedEncounterIds.has(encounter.id),
  )
  const filteredProcedures = procedures.filter((procedure) => {
    if (excludedProcedures.has(procedure)) return false
    const linkedEncounterId = encounterReferenceId(procedure)
    return !linkedEncounterId || !excludedEncounterIds.has(linkedEncounterId)
  })

  if (
    filteredEncounters.length === encounters.length
    && filteredProcedures.length === procedures.length
  ) {
    return input
  }

  return {
    ...input,
    ...(input.encounters ? { encounters: filteredEncounters } : {}),
    ...(input.procedures ? { procedures: filteredProcedures } : {}),
  }
}
