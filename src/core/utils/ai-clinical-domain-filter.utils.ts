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
const ROUTINE_PROCEDURE_TEXT =
  /(?:換藥|傷口(?:照護|護理|處置)|引流管(?:灌洗|沖洗)|管路(?:灌洗|沖洗)|導管(?:灌洗|沖洗)|拆線|change\s+dress(?:ing)?|wound\s+(?:care|treatment)|(?:tube|catheter|line)\s+(?:irrigation|flush(?:ing)?)|remove\s+(?:stitches|sutures))/i
const SURGICAL_PROCEDURE_TEXT =
  /(?:手術|切除術?|截除術?|剖腹|縫合術?|修補術?|成形術?|固定術?|引流術?|清創術?|植入術?|置換術?|吻合術?|燒灼術?|消融術?|結紮術?|活體組織檢查|切片術?|\bsurgery\b|\bsurgical\b|appendectomy|\w+ectomy\b|\w+otomy\b|\w+ostomy\b|\w+plasty\b|\w+pexy\b|\w+rrhaphy\b|\bresection\b|\bexcision\b|\bincision\b|\bdebridement\b|\bdrainage\b|\bbiopsy\b|\bablation\b|\bligation\b|\bsutur(?:e|ing)\b|\boperative\b)/i

// Common coded concepts that explicitly classify a Procedure as surgical.
// MediCloud exports frequently omit Procedure.category, so this is only one
// source of positive evidence; procedure display text is checked as fallback.
const SURGICAL_CATEGORY_CODES = new Set([
  '387713003', // SNOMED CT: Surgical procedure
  'surgery',
  'surgical-procedure',
])

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

function encounterCareType(encounter: any): 'outpatient' | 'inpatient' | 'emergency' | 'other' {
  const kind = String(getEncounterKindCode(encounter) ?? '').toLowerCase()
  const classCode = String(encounter?.class?.code ?? '').toLowerCase()
  if (['inpatient', 'imp', 'acute', 'ss', 'obsenc', 'prenc'].includes(kind)
      || ['imp', 'inpatient', 'acute', 'ss', 'obsenc', 'prenc'].includes(classCode)) {
    return 'inpatient'
  }
  if (['emergency', 'emer', 'ed'].includes(kind)
      || ['emer', 'emergency', 'ed'].includes(classCode)) {
    return 'emergency'
  }
  if (['outpatient', 'outpatient-or-emergency', 'amb', 'ambulatory', 'op'].includes(kind)
      || ['amb', 'ambulatory', 'outpatient', 'op'].includes(classCode)) {
    return 'outpatient'
  }
  return 'other'
}

export function hasExplicitSurgicalEvidence(procedure: any): boolean {
  // NHI item labels may start with a broad billing chapter such as
  // "手術、創傷處置及換藥". Routine aftercare remains non-surgical even when
  // that chapter label or an over-broad surgical category is present.
  if (ROUTINE_PROCEDURE_TEXT.test(conceptSearchText(procedure?.code))) return false

  const categoryCodings = procedure?.category?.coding ?? []
  if (categoryCodings.some((coding: any) =>
    SURGICAL_CATEGORY_CODES.has(String(coding?.code ?? '').trim().toLowerCase()),
  )) return true

  return SURGICAL_PROCEDURE_TEXT.test(procedureSearchText(procedure))
}

export function isAiExcludedRehabilitationProcedure(procedure: any): boolean {
  return REHABILITATION_TEXT.test(procedureSearchText(procedure))
}

export function isAiExcludedDentalProcedure(procedure: any): boolean {
  return DENTAL_TEXT.test(procedureSearchText(procedure))
}

export function isAiExcludedRoutineProcedure(procedure: any): boolean {
  return ROUTINE_PROCEDURE_TEXT.test(conceptSearchText(procedure?.code))
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
  const encountersById = new Map(
    encounters
      .filter((encounter) => encounter?.id)
      .map((encounter) => [encounter.id, encounter]),
  )
  const excludedEncounterIds = new Set(
    encounters
      .filter(isAiExcludedEncounterByOwnFields)
      .map((encounter) => encounter?.id)
      .filter(Boolean),
  )
  const excludedProcedures = new Set<any>()

  for (const procedure of procedures) {
    const excludedDomain = isAiExcludedDentalProcedure(procedure)
      || isAiExcludedRehabilitationProcedure(procedure)
    const linkedEncounterId = encounterReferenceId(procedure)
    if (excludedDomain) {
      excludedProcedures.add(procedure)
      if (linkedEncounterId) excludedEncounterIds.add(linkedEncounterId)
      continue
    }
    if (isAiExcludedRoutineProcedure(procedure)) {
      excludedProcedures.add(procedure)
      continue
    }
    if (linkedEncounterId && excludedEncounterIds.has(linkedEncounterId)) {
      excludedProcedures.add(procedure)
      continue
    }

    // Claims-oriented outpatient feeds contain many routine services that add
    // little value to an initial LLM summary. Keep procedures automatically for
    // inpatient/emergency care; otherwise require explicit surgical evidence.
    const linkedEncounter = linkedEncounterId
      ? encountersById.get(linkedEncounterId)
      : undefined
    const careType = linkedEncounter ? encounterCareType(linkedEncounter) : 'other'
    if (!['inpatient', 'emergency'].includes(careType)
        && !hasExplicitSurgicalEvidence(procedure)) {
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
