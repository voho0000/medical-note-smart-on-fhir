import type {
  AllergyEntity,
  CarePlanEntity,
  ConditionEntity,
  EncounterEntity,
  ImmunizationEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type {
  CdssFact,
  CdssFactSource,
  CdssMedicationClassId,
  CdssPatientProfile,
  CdssUacrReading,
} from '../types'
import {
  assessMedicationClass,
  classifyCurrentMedications,
  currentMedicationRecords,
  medicationDisplayName,
  medicationClassSources,
} from './medication-classifier'
import { assessMedicationClassAllergies } from './allergy-classifier'
import { deriveDcsiEvidence } from '../risk-stratification/dcsi-codebook'
import {
  assessFactFreshness,
  derivePreventiveCareEvidence,
} from './preventive-care-classifier'

const ICD10_CM_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'
const NHI_DRUG_CODE_SYSTEM = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code'

const HBA1C_LOINC = '4548-4'
const EGFR_LOINC = new Set(['69405-9', '77147-7'])
const EGFR_UCUM_UNITS = new Set([
  'ml/min/1.73m2',
  'ml/min/1.73m^2',
  'ml/min/{1.73_m2}',
  'ml/min/{1.73m2}',
])
const SERUM_CREATININE_LOINC = '2160-0'
const HEMOGLOBIN_LOINC = '718-7'
const BICARBONATE_LOINC = new Set(['1963-8', '2028-9'])
const CALCIUM_LOINC = new Set(['17861-6', '2000-8'])
const PHOSPHATE_LOINC = new Set(['2777-1'])
const PARATHYROID_HORMONE_LOINC = new Set(['2731-8'])
const ALKALINE_PHOSPHATASE_LOINC = new Set(['6768-6'])
const ALBUMIN_LOINC = new Set(['1751-7'])
const POTASSIUM_LOINC = '2823-3'
const TOTAL_CHOLESTEROL_LOINC = '2093-3'
const LDL_LOINC = new Set(['13457-7', '18262-6', '2089-1'])
const UACR_LOINC = new Set(['14959-1', '9318-7'])
const UACR_STANDARD_TEST_CODES = new Set(['ACR', 'UACR'])
const QUANTITATIVE_UACR_UNITS = new Set([
  'mg/g',
  'mg/g{creat}',
  'mg/gcreat',
  'mg/gcreatinine',
  'mg/gcr',
  'ug/mg',
  'ug/mg{creat}',
  'ug/mgcreat',
  'ug/mgcreatinine',
  'ug/mgcr',
  'mcg/mg',
  'mcg/mgcreatinine',
])
const BP_PANEL_LOINC = '85354-9'
const SYSTOLIC_BP_LOINC = '8480-6'
const DIASTOLIC_BP_LOINC = '8462-4'
const FORXIGA_NHI_CODE = 'BC26476100'

const ACCEPTED_OBSERVATION_STATUS = new Set(['final', 'amended', 'corrected'])
const EXCLUDED_CONDITION_STATUS = new Set(['inactive', 'resolved', 'entered-in-error'])
const EXCLUDED_VERIFICATION_STATUS = new Set(['refuted', 'entered-in-error'])
const EXCLUDED_ENCOUNTER_STATUS = new Set(['cancelled', 'entered-in-error'])
const EXCLUDED_MEDICATION_STATUS = new Set(['cancelled', 'entered-in-error'])
const COMMON_NSAID_PATTERN = /\b(?:ibuprofen|naproxen|diclofenac|ketorolac|celecoxib|etoricoxib|indomethacin|mefenamic acid|meloxicam|piroxicam|nsaid)\b|布洛芬|萘普生|雙氯芬酸|酮咯酸|塞來昔布|依托考昔|吲哚美辛|甲芬那酸|美洛昔康|非類固醇消炎/i

type CodingLike = { system?: string; code?: string; display?: string }

interface DiagnosisCandidate {
  basis: 'condition' | 'encounter_diagnosis'
  resourceType: 'Condition' | 'Encounter'
  resourceId: string
  coding: CodingLike
  date?: string
  status?: string
  facility?: string
  sourceSystem?: string
}

export interface FhirCdssProfileInput {
  patient: PatientEntity
  conditions: ConditionEntity[]
  encounters: EncounterEntity[]
  observations: ObservationEntity[]
  medications: MedicationEntity[]
  allergies: AllergyEntity[]
  carePlans: CarePlanEntity[]
  procedures?: ProcedureEntity[]
  immunizations?: ImmunizationEntity[]
  now?: Date
}

function dateOnly(value?: string): string | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return undefined
  return value.slice(0, 10)
}

function dateValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function calculateAgeAt(birthDate: string | undefined, now: Date): number | undefined {
  if (!birthDate) return undefined
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return undefined
  let age = now.getFullYear() - birth.getFullYear()
  const month = now.getMonth() - birth.getMonth()
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? age : undefined
}

function hasCoding(
  codings: readonly CodingLike[] | undefined,
  system: string,
  code: string,
): boolean {
  return codings?.some((coding) => coding.system === system && coding.code === code) === true
}

function findCoding(
  codings: readonly CodingLike[] | undefined,
  system: string,
  predicate: (code: string) => boolean,
): CodingLike | undefined {
  return codings?.find((coding) => (
    coding.system === system
    && typeof coding.code === 'string'
    && predicate(coding.code)
  ))
}

function normalizedUnit(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('µ', 'u')
    .replaceAll('μ', 'u')
    .replaceAll('²', '2')
    .replaceAll(' ', '')
}

function hasExpectedUnit(
  quantity: ObservationEntity['valueQuantity'] | undefined,
  accepted: ReadonlySet<string>,
): boolean {
  if (!quantity || typeof quantity.value !== 'number') return false
  if (quantity.system && quantity.system !== UCUM_SYSTEM) return false
  const candidates = [quantity.code, quantity.unit].map(normalizedUnit).filter(Boolean)
  return candidates.some((candidate) => accepted.has(candidate))
}

function isGovernedObservation(observation: ObservationEntity): boolean {
  return Boolean(
    observation.id
    && observation.effectiveDateTime
    && dateOnly(observation.effectiveDateTime)
    && observation.status
    && ACCEPTED_OBSERVATION_STATUS.has(observation.status),
  )
}

function observationSource(
  observation: ObservationEntity,
  value: number | string,
  unit?: string,
): CdssFactSource {
  return {
    resourceType: 'Observation',
    resourceId: observation.id!,
    date: dateOnly(observation.effectiveDateTime),
    status: observation.status,
    value,
    ...(unit ? { unit } : {}),
    coding: observation.code?.coding,
    facility: observation.performer?.find((performer) => performer.display)?.display,
    sourceSystem: observation.sourceSystem,
  }
}

function diagnosisSource(candidate: DiagnosisCandidate): CdssFactSource {
  return {
    resourceType: candidate.resourceType,
    resourceId: candidate.resourceId,
    date: dateOnly(candidate.date),
    status: candidate.status,
    coding: [candidate.coding],
    facility: candidate.facility,
    sourceSystem: candidate.sourceSystem,
  }
}

function medicationSource(medication: MedicationEntity): CdssFactSource {
  const resourceType = medication._sourceResourceType ?? 'MedicationRequest'
  return {
    resourceType,
    resourceId: medication.id,
    date: dateOnly(medication.authoredOn),
    status: medication.status,
    coding: medication.medicationCodeableConcept?.coding,
    facility: resourceType === 'MedicationStatement'
      ? medication.informationSource?.display
      : medication.requester?.display,
    sourceSystem: medication.sourceSystem,
  }
}

function medicationSearchText(medication: MedicationEntity): string {
  return [
    medicationDisplayName(medication),
    medication.medicationReference?.display,
    ...(medication.medicationCodeableConcept?.coding ?? []).flatMap((coding) => [
      coding.code,
      coding.display,
    ]),
  ].filter(Boolean).join(' ')
}

function currentMedicationOverviewFact(
  medications: readonly MedicationEntity[],
): CdssFact | undefined {
  const current = currentMedicationRecords(medications)
  if (current.length === 0) return undefined
  const names = current.map(medicationDisplayName)
  const display = names.slice(0, 5).join('、')
  const suffix = names.length > 5 ? `等 ${names.length} 筆` : `${names.length} 筆`
  return {
    zh: `資料切片內目前用藥 ${suffix}：${display}`,
    en: `${names.length} current medication record(s) in the available data slice: ${names.slice(0, 5).join(', ')}`,
    sources: current.map(medicationSource),
  }
}

function currentNsaidFact(
  medications: readonly MedicationEntity[],
): CdssFact | undefined {
  const matches = currentMedicationRecords(medications)
    .filter((medication) => COMMON_NSAID_PATTERN.test(medicationSearchText(medication)))
  if (matches.length === 0) return undefined
  const names = matches.map(medicationDisplayName)
  return {
    zh: `辨識到可能的 NSAID：${names.join('、')}`,
    en: `Potential NSAID record(s) identified: ${names.join(', ')}`,
    sources: matches.map(medicationSource),
  }
}

function carePlanSource(carePlan: CarePlanEntity): CdssFactSource {
  return {
    resourceType: 'CarePlan',
    resourceId: carePlan.id,
    date: dateOnly(carePlan.period?.start ?? carePlan.created),
    status: carePlan.status,
    value: carePlan.title ?? carePlan.description ?? 'CKD care plan',
    facility: carePlan.author?.display,
    sourceSystem: carePlan.sourceSystem,
  }
}

function collectDiagnoses(
  conditions: readonly ConditionEntity[],
  encounters: readonly EncounterEntity[],
  codePredicate: (code: string) => boolean,
): DiagnosisCandidate[] {
  const conditionCandidates = conditions.flatMap((condition): DiagnosisCandidate[] => {
    if (!condition.id) return []
    if (condition.clinicalStatus && EXCLUDED_CONDITION_STATUS.has(condition.clinicalStatus)) return []
    if (condition.verificationStatus && EXCLUDED_VERIFICATION_STATUS.has(condition.verificationStatus)) return []
    const coding = findCoding(condition.code?.coding, ICD10_CM_SYSTEM, codePredicate)
    if (!coding) return []
    return [{
      basis: 'condition',
      resourceType: 'Condition',
      resourceId: condition.id,
      coding,
      date: condition.recordedDate ?? condition.onsetDateTime,
      status: condition.clinicalStatus,
      sourceSystem: condition.sourceSystem,
    }]
  })

  const encounterCandidates = encounters.flatMap((encounter): DiagnosisCandidate[] => {
    if (!encounter.id || (encounter.status && EXCLUDED_ENCOUNTER_STATUS.has(encounter.status))) return []
    return (encounter.reasonCode ?? []).flatMap((reason): DiagnosisCandidate[] => {
      const coding = findCoding(reason.coding, ICD10_CM_SYSTEM, codePredicate)
      if (!coding) return []
      return [{
        basis: 'encounter_diagnosis',
        resourceType: 'Encounter',
        resourceId: encounter.id,
        coding,
        date: encounter.period?.start,
        status: encounter.status,
        facility: encounter.serviceProvider?.display ?? encounter.location?.[0]?.location?.display,
        sourceSystem: encounter.sourceSystem,
      }]
    })
  })

  return [...conditionCandidates, ...encounterCandidates]
}

function collectDmDiagnoses(
  conditions: readonly ConditionEntity[],
  encounters: readonly EncounterEntity[],
): DiagnosisCandidate[] {
  return collectDiagnoses(conditions, encounters, (code) => /^E11(?:\.|$)/.test(code))
}

function collectCkdDiagnoses(
  conditions: readonly ConditionEntity[],
  encounters: readonly EncounterEntity[],
): DiagnosisCandidate[] {
  return collectDiagnoses(conditions, encounters, (code) => /^N18(?:\.|$)/.test(code))
}

function diagnosisPriority(candidate: DiagnosisCandidate): number {
  if (candidate.coding.code === 'E11.22') return 3
  if (candidate.coding.code === 'E11.21') return 2
  return 1
}

function selectEligibilityDiagnosis(candidates: readonly DiagnosisCandidate[]): DiagnosisCandidate | undefined {
  return [...candidates].sort((a, b) => (
    diagnosisPriority(b) - diagnosisPriority(a)
    || dateValue(b.date) - dateValue(a.date)
  ))[0]
}

function findLatestValidatedObservation(
  observations: readonly ObservationEntity[],
  code: string,
  acceptedUnits: ReadonlySet<string>,
): ObservationEntity | undefined {
  return observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && hasCoding(observation.code?.coding, LOINC_SYSTEM, code)
      && hasExpectedUnit(observation.valueQuantity, acceptedUnits)
    ))
    .sort((a, b) => dateValue(b.effectiveDateTime) - dateValue(a.effectiveDateTime))[0]
}

function findLatestValidatedObservationFromCodes(
  observations: readonly ObservationEntity[],
  codes: ReadonlySet<string>,
  acceptedUnits: ReadonlySet<string>,
): ObservationEntity | undefined {
  return observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && observation.code?.coding?.some((coding) => (
        coding.system === LOINC_SYSTEM
        && typeof coding.code === 'string'
        && codes.has(coding.code)
      )) === true
      && hasExpectedUnit(observation.valueQuantity, acceptedUnits)
    ))
    .sort((a, b) => dateValue(b.effectiveDateTime) - dateValue(a.effectiveDateTime))[0]
}

function observationFact(
  observation: ObservationEntity,
  displayUnit: string,
): CdssFact | undefined {
  const value = observation.valueQuantity?.value
  if (value === undefined) return undefined
  const date = dateOnly(observation.effectiveDateTime)
  return {
    zh: `${value} ${displayUnit}${date ? `（${date}）` : ''}`,
    en: `${value} ${displayUnit}${date ? ` (${date})` : ''}`,
    numericValue: value,
    unit: displayUnit,
    date,
    sources: [observationSource(observation, value, displayUnit)],
  }
}

function latestDiagnosis(
  conditions: readonly ConditionEntity[],
  encounters: readonly EncounterEntity[],
  codePredicate: (code: string) => boolean,
): DiagnosisCandidate | undefined {
  return collectDiagnoses(conditions, encounters, codePredicate)
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))[0]
}

function diagnosisFact(
  candidate: DiagnosisCandidate,
  labelZh: string,
  labelEn: string,
): CdssFact {
  const date = dateOnly(candidate.date)
  const diagnosis = candidate.coding.display ?? candidate.coding.code ?? ''
  return {
    zh: `${labelZh}：${diagnosis}${date ? `（${date}）` : ''}`,
    en: `${labelEn}: ${diagnosis}${date ? ` (${date})` : ''}`,
    date,
    sources: [diagnosisSource(candidate)],
  }
}

function validatedEgfrObservations(observations: readonly ObservationEntity[]): ObservationEntity[] {
  return observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && observation.code?.coding?.some((coding) => (
        coding.system === LOINC_SYSTEM
        && typeof coding.code === 'string'
        && EGFR_LOINC.has(coding.code)
      )) === true
      && hasExpectedUnit(observation.valueQuantity, EGFR_UCUM_UNITS)
    ))
    .sort((a, b) => dateValue(a.effectiveDateTime) - dateValue(b.effectiveDateTime))
}

function persistentReducedEgfrPair(
  observations: readonly ObservationEntity[],
): readonly [ObservationEntity, ObservationEntity] | undefined {
  const reduced = observations.filter((observation) => (
    observation.valueQuantity?.value !== undefined
    && observation.valueQuantity.value < 60
  ))
  if (reduced.length < 2) return undefined

  const latest = reduced.at(-1)!
  const latestDate = dateValue(latest.effectiveDateTime)
  const minimumIntervalMs = 90 * 24 * 60 * 60 * 1000
  const earlier = reduced.find((observation) => (
    latestDate - dateValue(observation.effectiveDateTime) >= minimumIntervalMs
  ))
  return earlier ? [earlier, latest] : undefined
}

function isUacrObservation(observation: ObservationEntity): boolean {
  const hasLoinc = observation.code?.coding?.some((coding) => (
    coding.system === LOINC_SYSTEM
    && typeof coding.code === 'string'
    && UACR_LOINC.has(coding.code)
  )) === true
  if (hasLoinc) return true

  const hasStandardTestCode = observation.code?.coding?.some((coding) => (
    typeof coding.code === 'string'
    && UACR_STANDARD_TEST_CODES.has(coding.code.trim().toUpperCase())
  )) === true
  if (hasStandardTestCode) return true

  const testName = [
    observation.code?.text,
    ...(observation.code?.coding ?? []).map((coding) => coding.display),
  ].filter(Boolean).join(' ')

  return (
    /\b(?:uacr|acr)\b/i.test(testName)
    || /(?:albumin|白蛋白|微白蛋白)\s*[/／]\s*(?:creatinine|肌酸酐|肌酐)/i.test(testName)
    || /(?:albumin|白蛋白|微白蛋白).*(?:creatinine|肌酸酐|肌酐).*(?:ratio|比值?|比率)/i.test(testName)
    || /(?:ratio|比值?|比率).*(?:albumin|白蛋白|微白蛋白).*(?:creatinine|肌酸酐|肌酐)/i.test(testName)
  )
}

function findUacrRecords(observations: readonly ObservationEntity[]): ObservationEntity[] {
  return observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && isUacrObservation(observation)
    ))
    .sort((a, b) => dateValue(b.effectiveDateTime) - dateValue(a.effectiveDateTime))
}

function uacrTestName(observation: ObservationEntity): string {
  return [
    observation.code?.text,
    ...(observation.code?.coding ?? []).map((coding) => coding.display),
  ].filter(Boolean).join(' ')
}

function uacrRawValue(observation: ObservationEntity): string {
  return observation.valueString
    ?? observation.valueCodeableConcept?.text
    ?? '有紀錄但無可比較定量值'
}

function semiquantitativeLowerBound(raw: string): number | undefined {
  const normalized = raw.normalize('NFKC').replaceAll('＝', '=')
  const match = normalized.match(/(?:>=|≥)\s*(\d+(?:\.\d+)?)/)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function toUacrReading(observation: ObservationEntity): CdssUacrReading {
  const date = dateOnly(observation.effectiveDateTime)
  if (
    hasExpectedUnit(observation.valueQuantity, QUANTITATIVE_UACR_UNITS)
    && observation.valueQuantity?.value !== undefined
  ) {
    const value = observation.valueQuantity.value
    return {
      kind: 'quantitative',
      date,
      displayValue: `${value} mg/g`,
      numericValueMgG: value,
      zh: `${value} mg/g${date ? `（${date}）` : ''}`,
      en: `${value} mg/g${date ? ` (${date})` : ''}`,
      source: observationSource(observation, value, 'mg/g'),
    }
  }

  const raw = uacrRawValue(observation)
  const isSemiquantitative = (
    /半定量|semiquantitative|semi-quantitative/i.test(uacrTestName(observation))
    || /\b\d+\s*\+/i.test(raw)
  )
  return {
    kind: isSemiquantitative ? 'semiquantitative' : 'nonquantitative',
    date,
    displayValue: raw,
    ...(isSemiquantitative ? { lowerBoundMgG: semiquantitativeLowerBound(raw) } : {}),
    zh: `${isSemiquantitative ? '半定量' : '非定量'} UACR：${raw}${date ? `（${date}）` : ''}`,
    en: `${isSemiquantitative ? 'Semiquantitative' : 'Non-quantitative'} UACR: ${raw}${date ? ` (${date})` : ''}`,
    source: observationSource(observation, raw),
  }
}

function uacrReadingFact(reading: CdssUacrReading): CdssFact {
  const isQuantitative = (
    reading.kind === 'quantitative'
    && reading.numericValueMgG !== undefined
  )
  return {
    zh: reading.zh,
    en: reading.en,
    ...(isQuantitative ? {
      numericValue: reading.numericValueMgG,
      unit: 'mg/g',
    } : {}),
    date: reading.date,
    sources: reading.source ? [reading.source] : undefined,
  }
}

function uacrOverviewFact(
  latestReading: CdssUacrReading,
  latestQuantitativeReading?: CdssUacrReading,
): CdssFact {
  const datedValue = (reading: CdssUacrReading): string => {
    const value = reading.displayValue
      ?? (reading.numericValueMgG !== undefined ? `${reading.numericValueMgG} mg/g` : reading.zh)
    return `${value}${reading.date ? ` · ${reading.date}` : ''}`
  }
  const quantitativeIsLatest = (
    latestQuantitativeReading?.source?.resourceId
    && latestQuantitativeReading.source.resourceId === latestReading.source?.resourceId
  )
  const quantitativeSuffixZh = latestQuantitativeReading && !quantitativeIsLatest
    ? ` ｜ 最近定量：${datedValue(latestQuantitativeReading)}`
    : ''
  const quantitativeSuffixEn = latestQuantitativeReading && !quantitativeIsLatest
    ? ` | Latest quantitative: ${datedValue(latestQuantitativeReading)}`
    : ''
  const sources = [latestReading.source, quantitativeIsLatest ? undefined : latestQuantitativeReading?.source]
    .filter((source): source is CdssFactSource => Boolean(source))

  return {
    zh: `${datedValue(latestReading)}${quantitativeSuffixZh}`,
    en: `${datedValue(latestReading)}${quantitativeSuffixEn}`,
    date: latestReading.date,
    sources,
  }
}

function bloodPressureFact(observations: readonly ObservationEntity[]): CdssFact | undefined {
  const acceptedUnits = new Set(['mmhg', 'mm[hg]'])
  const candidates = observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && hasCoding(observation.code?.coding, LOINC_SYSTEM, BP_PANEL_LOINC)
    ))
    .flatMap((observation) => {
      const systolic = observation.component?.find((component) => (
        hasCoding(component.code?.coding, LOINC_SYSTEM, SYSTOLIC_BP_LOINC)
        && hasExpectedUnit(component.valueQuantity, acceptedUnits)
      ))
      const diastolic = observation.component?.find((component) => (
        hasCoding(component.code?.coding, LOINC_SYSTEM, DIASTOLIC_BP_LOINC)
        && hasExpectedUnit(component.valueQuantity, acceptedUnits)
      ))
      if (systolic?.valueQuantity?.value === undefined || diastolic?.valueQuantity?.value === undefined) return []
      return [{
        observation,
        systolic: systolic.valueQuantity.value,
        diastolic: diastolic.valueQuantity.value,
      }]
    })
    .sort((a, b) => dateValue(b.observation.effectiveDateTime) - dateValue(a.observation.effectiveDateTime))

  const latest = candidates[0]
  if (!latest) return undefined
  const date = dateOnly(latest.observation.effectiveDateTime)
  const display = `${latest.systolic}/${latest.diastolic} mmHg${date ? `（${date}）` : ''}`
  return {
    zh: display,
    en: `${latest.systolic}/${latest.diastolic} mmHg${date ? ` (${date})` : ''}`,
    unit: 'mmHg',
    date,
    sources: [observationSource(
      latest.observation,
      `${latest.systolic}/${latest.diastolic}`,
      'mmHg',
    )],
  }
}

function findForxigaMedications(medications: readonly MedicationEntity[]): MedicationEntity[] {
  return medications
    .filter((medication) => (
      medication.id
      && medication.status
      && !EXCLUDED_MEDICATION_STATUS.has(medication.status)
      && hasCoding(
        medication.medicationCodeableConcept?.coding,
        NHI_DRUG_CODE_SYSTEM,
        FORXIGA_NHI_CODE,
      )
    ))
    .sort((a, b) => dateValue(b.authoredOn) - dateValue(a.authoredOn))
}

function averageDailyUnits(medication: MedicationEntity): number | undefined {
  const dispense = medication.dispenseRequest as {
    quantity?: { value?: number }
    expectedSupplyDuration?: { value?: number; code?: string; unit?: string }
  } | undefined
  const quantity = dispense?.quantity?.value
  const duration = dispense?.expectedSupplyDuration?.value
  const durationUnit = (
    dispense?.expectedSupplyDuration?.code
    ?? dispense?.expectedSupplyDuration?.unit
    ?? ''
  ).toLowerCase()
  if (
    typeof quantity === 'number'
    && typeof duration === 'number'
    && duration > 0
    && (durationUnit === 'd' || durationUnit.includes('day'))
  ) {
    return Math.round((quantity / duration) * 100) / 100
  }

  const instruction = medication.dosageInstruction?.find((item) => (
    typeof item.timing?.repeat?.frequency === 'number'
  ))
  const frequency = instruction?.timing?.repeat?.frequency
  const period = instruction?.timing?.repeat?.period ?? 1
  const periodUnit = instruction?.timing?.repeat?.periodUnit?.toLowerCase()
  const dose = instruction?.doseAndRate?.[0]?.doseQuantity?.value ?? 1
  if (
    typeof frequency === 'number'
    && period > 0
    && (periodUnit === 'd' || periodUnit === 'day')
  ) {
    return Math.round(((frequency * dose) / period) * 100) / 100
  }
  return undefined
}

function ckdCareProgramText(carePlan: CarePlanEntity): string {
  return [
    carePlan.title,
    carePlan.description,
    ...(carePlan.category ?? []).flatMap((category) => [
      category.text,
      ...(category.coding ?? []).map((coding) => coding.display),
    ]),
  ].filter(Boolean).join(' ')
}

function activeCkdCarePrograms(carePlans: readonly CarePlanEntity[]): CarePlanEntity[] {
  return carePlans
    .filter((carePlan) => (
      carePlan.status === 'active'
      && /初期慢性腎(?:臟)?病|早期\s*CKD|末期腎臟病前期|pre-esrd/i.test(
        ckdCareProgramText(carePlan),
      )
    ))
    .sort((a, b) => (
      dateValue(b.period?.start ?? b.created) - dateValue(a.period?.start ?? a.created)
    ))
}

function activeCkdCareProgramTitle(carePlans: readonly CarePlanEntity[]): string | undefined {
  return activeCkdCarePrograms(carePlans)[0]?.title
}

function sglt2Indication(medication: MedicationEntity): {
  codes: string[]
  texts: string[]
  route: 'ckd' | 't2dm' | 'heart-failure' | 'unknown'
} {
  const reasonCodings = (medication.reasonCode ?? []).flatMap((reason) => reason.coding ?? [])
  const claimIndicationCodes = reasonCodings
    .map((coding) => coding.code)
    .filter((code): code is string => Boolean(code))
  const claimIndicationTexts = [
    ...(medication.reasonCode ?? []).map((reason) => reason.text),
    ...reasonCodings.map((coding) => coding.display),
  ].filter((value): value is string => Boolean(value))
  const searchable = [...claimIndicationCodes, ...claimIndicationTexts].join(' ')
  const indicationRoute = /(?:^|\s)N18(?:\.|\d|\s)|慢性腎|chronic kidney/i.test(searchable)
    ? 'ckd'
    : /(?:^|\s)E11(?:\.|\d|\s)|第二型糖尿病|type 2 diabetes/i.test(searchable)
      ? 't2dm'
      : /(?:^|\s)I50(?:\.|\d|\s)|心臟衰竭|心衰竭|heart failure/i.test(searchable)
        ? 'heart-failure'
        : 'unknown'

  return {
    codes: claimIndicationCodes,
    texts: claimIndicationTexts,
    route: indicationRoute,
  }
}

function nhiSglt2CoverageContext(
  medication: MedicationEntity,
  forxigaMedications: readonly MedicationEntity[],
  carePlans: readonly CarePlanEntity[],
): NonNullable<CdssPatientProfile['coverageContexts']>['taiwanNhiSglt2'] {
  const indication = sglt2Indication(medication)
  const earliestObservedPrescriptionDate = forxigaMedications
    .filter((candidate) => sglt2Indication(candidate).route === indication.route)
    .map((candidate) => dateOnly(candidate.authoredOn))
    .filter((date): date is string => Boolean(date))
    .sort()[0]

  return {
    product: 'dapagliflozin',
    prescriptionDate: dateOnly(medication.authoredOn),
    earliestObservedPrescriptionDate,
    dailyUnits: averageDailyUnits(medication),
    claimIndicationCodes: indication.codes,
    claimIndicationTexts: indication.texts,
    indicationRoute: indication.route,
    ckdCareProgramTitle: activeCkdCareProgramTitle(carePlans),
  }
}

function medicationUseState(
  medication: MedicationEntity,
): 'confirmed_current' | 'active_order_unconfirmed' | 'not_current' | 'unknown' {
  const sourceType = medication._sourceResourceType ?? 'MedicationRequest'
  if (sourceType === 'MedicationStatement' && medication.status === 'active') return 'confirmed_current'
  if (sourceType === 'MedicationRequest' && medication.status === 'active') return 'active_order_unconfirmed'
  if (medication.status === 'completed' || medication.status === 'stopped') return 'not_current'
  return 'unknown'
}

function ageFact(patient: PatientEntity, now: Date): CdssFact | undefined {
  const age = typeof patient.age === 'number' ? patient.age : calculateAgeAt(patient.birthDate, now)
  if (age === undefined) return undefined
  return {
    zh: `${age} 歲`,
    en: `Age ${age}`,
    numericValue: age,
    unit: 'years',
    sources: [{
      resourceType: 'Patient',
      resourceId: patient.id,
      date: patient.birthDate,
      value: age,
      unit: 'years',
    }],
  }
}

function sexFact(patient: PatientEntity): CdssFact | undefined {
  if (patient.gender !== 'male' && patient.gender !== 'female') return undefined
  return {
    zh: patient.gender === 'male' ? '男' : '女',
    en: patient.gender === 'male' ? 'Male' : 'Female',
    sources: [{
      resourceType: 'Patient',
      resourceId: patient.id,
      value: patient.gender,
    }],
  }
}

export function createFhirCdssPatientProfile(input: FhirCdssProfileInput): CdssPatientProfile {
  const now = input.now ?? new Date()
  const facts: Record<string, CdssFact> = {}

  const age = ageFact(input.patient, now)
  if (age) facts.age = age
  const sex = sexFact(input.patient)
  if (sex) facts.sex = sex

  const hba1c = findLatestValidatedObservation(input.observations, HBA1C_LOINC, new Set(['%']))
  if (hba1c?.valueQuantity?.value !== undefined) {
    const date = dateOnly(hba1c.effectiveDateTime)
    facts.HbA1c = {
      zh: `${hba1c.valueQuantity.value}%${date ? `（${date}）` : ''}`,
      en: `${hba1c.valueQuantity.value}%${date ? ` (${date})` : ''}`,
      numericValue: hba1c.valueQuantity.value,
      unit: '%',
      date,
      sources: [observationSource(hba1c, hba1c.valueQuantity.value, '%')],
    }
  }

  const egfrValues = validatedEgfrObservations(input.observations)
  const latestEgfr = egfrValues.at(-1)
  if (latestEgfr?.valueQuantity?.value !== undefined) {
    const date = dateOnly(latestEgfr.effectiveDateTime)
    facts.eGFR = {
      zh: `${latestEgfr.valueQuantity.value} mL/min/1.73m²${date ? `（${date}）` : ''}`,
      en: `${latestEgfr.valueQuantity.value} mL/min/1.73m²${date ? ` (${date})` : ''}`,
      numericValue: latestEgfr.valueQuantity.value,
      unit: 'mL/min/1.73m²',
      date,
      sources: [observationSource(
        latestEgfr,
        latestEgfr.valueQuantity.value,
        'mL/min/1.73m²',
      )],
    }
  }
  if (egfrValues.length >= 2) {
    const sources = egfrValues.slice(-4).map((observation) => observationSource(
      observation,
      observation.valueQuantity!.value!,
      'mL/min/1.73m²',
    ))
    const trend = sources.map((source) => `${source.date} ${source.value}`).join(' → ')
    facts.eGFRTrend = {
      zh: `${trend} mL/min/1.73m²`,
      en: `${trend} mL/min/1.73m²`,
      numericValue: latestEgfr?.valueQuantity?.value,
      unit: 'mL/min/1.73m²',
      date: dateOnly(latestEgfr?.effectiveDateTime),
      sources,
    }
  }
  const persistentEgfrPair = persistentReducedEgfrPair(egfrValues)
  if (persistentEgfrPair) {
    const [earlier, latest] = persistentEgfrPair
    const earlierDate = dateOnly(earlier.effectiveDateTime)
    const latestDate = dateOnly(latest.effectiveDateTime)
    facts.ckdChronicity = {
      zh: `至少兩次 eGFR <60，間隔達 3 個月（${earlierDate} → ${latestDate}）`,
      en: `At least two eGFR values below 60 separated by at least 3 months (${earlierDate} to ${latestDate})`,
      date: latestDate,
      sources: [earlier, latest].map((observation) => observationSource(
        observation,
        observation.valueQuantity!.value!,
        'mL/min/1.73m²',
      )),
    }
  }

  const ckdDiagnoses = collectCkdDiagnoses(input.conditions, input.encounters)
  const ckdDiagnosis = [...ckdDiagnoses]
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))[0]
  if (ckdDiagnosis) {
    facts.ckdDiagnosis = diagnosisFact(
      ckdDiagnosis,
      '慢性腎臟病診斷',
      'Chronic kidney disease diagnosis',
    )
  }

  const ckdCarePrograms = activeCkdCarePrograms(input.carePlans)
  if (ckdCarePrograms.length > 0) {
    const labels = ckdCarePrograms.map((carePlan) => (
      carePlan.title ?? carePlan.description ?? 'CKD care plan'
    ))
    facts.ckdCareProgram = {
      zh: `進行中：${labels.join('、')}`,
      en: `Active: ${labels.join(', ')}`,
      date: dateOnly(ckdCarePrograms[0].period?.start ?? ckdCarePrograms[0].created),
      sources: ckdCarePrograms.map(carePlanSource),
    }
    const hasEarlyProgram = ckdCarePrograms.some((carePlan) => (
      /初期慢性腎(?:臟)?病|早期\s*CKD/i.test(ckdCareProgramText(carePlan))
    ))
    const hasPreEsrdProgram = ckdCarePrograms.some((carePlan) => (
      /末期腎臟病前期|pre-esrd/i.test(ckdCareProgramText(carePlan))
    ))
    if (hasEarlyProgram && hasPreEsrdProgram) {
      facts.ckdCareProgramOverlap = {
        zh: '同時存在初期 CKD 與 Pre-ESRD 進行中照護計畫',
        en: 'Both Early CKD and Pre-ESRD care plans are active',
        sources: ckdCarePrograms.map(carePlanSource),
      }
    }
  }

  const diagnoses = collectDmDiagnoses(input.conditions, input.encounters)
  const eligibilityDiagnosis = selectEligibilityDiagnosis(diagnoses)
  const kidneyDiagnosis = diagnoses
    .filter((candidate) => candidate.coding.code === 'E11.21' || candidate.coding.code === 'E11.22')
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))[0]
  if (kidneyDiagnosis) {
    facts.kidneyDiagnosis = diagnosisFact(
      kidneyDiagnosis,
      '糖尿病腎臟病診斷',
      'Diabetic kidney disease diagnosis',
    )
  }

  const ascvdDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I2[0-5]|I6[3-6]|I70|I73\.9|G45)(?:\.|$)/.test(code),
  )
  if (ascvdDiagnosis) {
    facts.ascvdDiagnosis = diagnosisFact(
      ascvdDiagnosis,
      '動脈粥樣硬化心血管疾病',
      'Atherosclerotic cardiovascular disease',
    )
  }
  const heartFailureDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I50|I11\.0|I13\.(?:0|2))(?:\.|$)/.test(code),
  )
  if (heartFailureDiagnosis) {
    facts.heartFailureDiagnosis = diagnosisFact(
      heartFailureDiagnosis,
      '心衰竭',
      'Heart failure',
    )
  }
  const hypertensionDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^I(?:10|11|12|13|15)(?:\.|$)/.test(code),
  )
  if (hypertensionDiagnosis) {
    facts.hypertensionDiagnosis = diagnosisFact(
      hypertensionDiagnosis,
      '高血壓',
      'Hypertension',
    )
  }
  const hyperlipidemiaDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^E78(?:\.|$)/.test(code),
  )
  if (hyperlipidemiaDiagnosis) {
    facts.hyperlipidemiaDiagnosis = diagnosisFact(
      hyperlipidemiaDiagnosis,
      '血脂異常',
      'Dyslipidemia',
    )
  }

  const uacrRecords = findUacrRecords(input.observations)
  const uacrReadings = uacrRecords.map(toUacrReading)
  const latestUacrReading = uacrReadings[0]
  const latestQuantitativeReading = uacrReadings.find((reading) => reading.kind === 'quantitative')
  let uacrUseState: 'quantitative_comparable' | 'not_quantitative_comparable' | undefined
  if (latestUacrReading) {
    const isQuantitative = latestUacrReading.kind === 'quantitative'
    uacrUseState = isQuantitative ? 'quantitative_comparable' : 'not_quantitative_comparable'
    facts.urineAlbuminRatio = uacrReadingFact(latestUacrReading)
    facts.urineAlbuminOverview = uacrOverviewFact(
      latestUacrReading,
      latestQuantitativeReading,
    )
    if (latestQuantitativeReading) {
      facts.urineAlbuminRatioQuantitative = uacrReadingFact(latestQuantitativeReading)
    }
  }

  const bp = bloodPressureFact(input.observations)
  if (bp) facts.bloodPressure = bp

  const potassium = findLatestValidatedObservation(
    input.observations,
    POTASSIUM_LOINC,
    new Set(['mmol/l', 'meq/l']),
  )
  const potassiumFact = potassium ? observationFact(potassium, 'mmol/L') : undefined
  if (potassiumFact) facts.potassium = potassiumFact

  const serumCreatinine = findLatestValidatedObservation(
    input.observations,
    SERUM_CREATININE_LOINC,
    new Set(['mg/dl']),
  )
  const serumCreatinineFact = serumCreatinine
    ? observationFact(serumCreatinine, 'mg/dL')
    : undefined
  if (serumCreatinineFact) facts.serumCreatinine = serumCreatinineFact

  const hemoglobin = findLatestValidatedObservation(
    input.observations,
    HEMOGLOBIN_LOINC,
    new Set(['g/dl']),
  )
  const hemoglobinFact = hemoglobin ? observationFact(hemoglobin, 'g/dL') : undefined
  if (hemoglobinFact) facts.hemoglobin = hemoglobinFact

  const bicarbonate = findLatestValidatedObservationFromCodes(
    input.observations,
    BICARBONATE_LOINC,
    new Set(['mmol/l', 'meq/l']),
  )
  const bicarbonateFact = bicarbonate ? observationFact(bicarbonate, 'mmol/L') : undefined
  if (bicarbonateFact) facts.bicarbonate = bicarbonateFact

  const calcium = findLatestValidatedObservationFromCodes(
    input.observations,
    CALCIUM_LOINC,
    new Set(['mg/dl']),
  )
  const calciumFact = calcium ? observationFact(calcium, 'mg/dL') : undefined
  if (calciumFact) facts.calcium = calciumFact

  const phosphate = findLatestValidatedObservationFromCodes(
    input.observations,
    PHOSPHATE_LOINC,
    new Set(['mg/dl']),
  )
  const phosphateFact = phosphate ? observationFact(phosphate, 'mg/dL') : undefined
  if (phosphateFact) facts.phosphate = phosphateFact

  const parathyroidHormone = findLatestValidatedObservationFromCodes(
    input.observations,
    PARATHYROID_HORMONE_LOINC,
    new Set(['pg/ml', 'ng/l']),
  )
  const parathyroidHormoneFact = parathyroidHormone
    ? observationFact(parathyroidHormone, 'pg/mL')
    : undefined
  if (parathyroidHormoneFact) facts.parathyroidHormone = parathyroidHormoneFact

  const alkalinePhosphatase = findLatestValidatedObservationFromCodes(
    input.observations,
    ALKALINE_PHOSPHATASE_LOINC,
    new Set(['u/l', '[iu]/l', 'iu/l']),
  )
  const alkalinePhosphataseFact = alkalinePhosphatase
    ? observationFact(alkalinePhosphatase, 'U/L')
    : undefined
  if (alkalinePhosphataseFact) facts.alkalinePhosphatase = alkalinePhosphataseFact

  const albumin = findLatestValidatedObservationFromCodes(
    input.observations,
    ALBUMIN_LOINC,
    new Set(['g/dl']),
  )
  const albuminFact = albumin ? observationFact(albumin, 'g/dL') : undefined
  if (albuminFact) facts.albumin = albuminFact

  const totalCholesterol = findLatestValidatedObservation(
    input.observations,
    TOTAL_CHOLESTEROL_LOINC,
    new Set(['mg/dl']),
  )
  const totalCholesterolFact = totalCholesterol
    ? observationFact(totalCholesterol, 'mg/dL')
    : undefined
  if (totalCholesterolFact) facts.totalCholesterol = totalCholesterolFact

  const ldl = findLatestValidatedObservationFromCodes(
    input.observations,
    LDL_LOINC,
    new Set(['mg/dl']),
  )
  const ldlFact = ldl ? observationFact(ldl, 'mg/dL') : undefined
  if (ldlFact) facts.LDL = ldlFact

  const medicationListOverview = currentMedicationOverviewFact(input.medications)
  if (medicationListOverview) facts.medicationListOverview = medicationListOverview
  const currentNsaid = currentNsaidFact(input.medications)
  if (currentNsaid) facts.currentNsaid = currentNsaid

  const classifiedMedications = classifyCurrentMedications(input.medications)
  const allergyAssessments = assessMedicationClassAllergies(input.allergies)
  const insulinAssessment = assessMedicationClass(classifiedMedications, 'insulin')
  const sulfonylureaAssessment = assessMedicationClass(classifiedMedications, 'sulfonylurea')
  const sglt2Assessment = assessMedicationClass(classifiedMedications, 'sglt2-inhibitor')
  const statinAssessment = assessMedicationClass(classifiedMedications, 'statin')
  const aceArbAssessment = assessMedicationClass(classifiedMedications, 'ace-inhibitor-or-arb')
  const finerenoneAssessment = assessMedicationClass(classifiedMedications, 'finerenone')
  const medicationDataDates = input.medications
    .map((medication) => dateOnly(medication.authoredOn))
    .filter((date): date is string => Boolean(date))
    .sort()
  const medicationClassTimeline = (
    assessment: ReturnType<typeof assessMedicationClass>,
  ) => {
    const dates = assessment.medications
      .filter((item) => item.state === assessment.state)
      .map((item) => dateOnly(item.medication.authoredOn))
      .filter((date): date is string => Boolean(date))
      .sort()
    return {
      ...(dates.at(-1) ? { lastPrescriptionDate: dates.at(-1) } : {}),
      ...(medicationDataDates[0] ? { dataWindowStartDate: medicationDataDates[0] } : {}),
      ...(medicationDataDates.at(-1) ? {
        dataWindowEndDate: medicationDataDates.at(-1),
      } : {}),
    }
  }
  const medicationClassNames = (
    assessment: ReturnType<typeof assessMedicationClass>,
  ) => assessment.medications
    .filter((item) => item.state === assessment.state)
    .map((item) => item.name)
  const insulinTimeline = medicationClassTimeline(insulinAssessment)
  const sulfonylureaTimeline = medicationClassTimeline(sulfonylureaAssessment)
  const sglt2Timeline = medicationClassTimeline(sglt2Assessment)
  const statinTimeline = medicationClassTimeline(statinAssessment)
  const aceArbTimeline = medicationClassTimeline(aceArbAssessment)
  const finerenoneTimeline = medicationClassTimeline(finerenoneAssessment)
  const hypoglycemiaAssessments = [insulinAssessment, sulfonylureaAssessment]
  const medicationClassState = (
    [
      'confirmed-current',
      'active-order-unconfirmed',
      'on-hold',
      'historical-record-current-status-unknown',
    ] as const
  ).find((state) => (
    insulinAssessment.state === state || sulfonylureaAssessment.state === state
  )) ?? (
    insulinAssessment.state === 'uncertain'
    || sulfonylureaAssessment.state === 'uncertain'
      ? 'uncertain'
      : 'not-found'
  )
  const hypoglycemiaRiskNames = [...new Set(
    hypoglycemiaAssessments
      .flatMap((assessment) => assessment.medications)
      .filter((item) => item.state === medicationClassState)
      .map((item) => item.name),
  )]
  const hypoglycemiaMedicationSources = hypoglycemiaAssessments
    .filter((assessment) => assessment.state === medicationClassState)
    .flatMap(medicationClassSources)
  facts.hypoglycemiaRiskMedications = medicationClassState === 'confirmed-current'
    ? {
        zh: `已確認使用：${hypoglycemiaRiskNames.join('、')}`,
        en: `Confirmed current use: ${hypoglycemiaRiskNames.join(', ')}`,
        sources: hypoglycemiaMedicationSources,
      }
    : medicationClassState === 'active-order-unconfirmed'
      ? {
          zh: `已有處方、尚未確認實際使用：${hypoglycemiaRiskNames.join('、')}`,
          en: `Active order; actual use unconfirmed: ${hypoglycemiaRiskNames.join(', ')}`,
          sources: hypoglycemiaMedicationSources,
        }
      : medicationClassState === 'on-hold'
        ? {
            zh: `暫停中的胰島素／磺醯脲：${hypoglycemiaRiskNames.join('、')}`,
            en: `Insulin/sulfonylurea on hold: ${hypoglycemiaRiskNames.join(', ')}`,
            sources: hypoglycemiaMedicationSources,
          }
        : medicationClassState === 'historical-record-current-status-unknown'
          ? {
              zh: `有歷史胰島素／磺醯脲處方，近期是否持續未知：${hypoglycemiaRiskNames.join('、')}`,
              en: `Historical insulin/sulfonylurea record; current use is unknown: ${hypoglycemiaRiskNames.join(', ')}`,
              sources: hypoglycemiaMedicationSources,
            }
          : medicationClassState === 'uncertain'
            ? {
                zh: `有 ${classifiedMedications.unclassifiedAntidiabeticCount} 筆降糖藥無法辨識成分`,
                en: `${classifiedMedications.unclassifiedAntidiabeticCount} glucose-lowering medication record(s) have an unrecognized ingredient`,
              }
            : {
                zh: '現有資料未見胰島素或磺醯脲',
                en: 'No insulin or sulfonylurea appears in the available medication data',
              }

  const classFact = (
    assessment: ReturnType<typeof assessMedicationClass>,
    classZh: string,
    classEn: string,
  ): CdssFact => {
    const names = assessment.medications
      .filter((item) => item.state === assessment.state)
      .map((item) => item.name)
    const suffixZh = names.length > 0 ? `：${names.join('、')}` : ''
    const suffixEn = names.length > 0 ? `: ${names.join(', ')}` : ''
    const timeline = medicationClassTimeline(assessment)
    const timelineZh = assessment.state === 'historical-record-current-status-unknown'
      ? `（最後處方 ${timeline.lastPrescriptionDate ?? '日期不明'}；用藥資料範圍 ${timeline.dataWindowStartDate ?? '不明'}–${timeline.dataWindowEndDate ?? '不明'}）`
      : ''
    const timelineEn = assessment.state === 'historical-record-current-status-unknown'
      ? ` (last prescription ${timeline.lastPrescriptionDate ?? 'unknown'}; medication data window ${timeline.dataWindowStartDate ?? 'unknown'}–${timeline.dataWindowEndDate ?? 'unknown'})`
      : ''
    const labels = {
      'confirmed-current': {
        zh: `已確認使用 ${classZh}${suffixZh}`,
        en: `Confirmed current ${classEn} use${suffixEn}`,
      },
      'active-order-unconfirmed': {
        zh: `已有 ${classZh} 處方，尚未確認實際使用${suffixZh}`,
        en: `Active ${classEn} order; actual use unconfirmed${suffixEn}`,
      },
      'on-hold': {
        zh: `${classZh} 暫停中${suffixZh}`,
        en: `${classEn} is on hold${suffixEn}`,
      },
      'historical-record-current-status-unknown': {
        zh: `有歷史 ${classZh} 處方，近期是否持續未知${suffixZh}${timelineZh}`,
        en: `Historical ${classEn} record; current use is unknown${suffixEn}${timelineEn}`,
      },
      uncertain: {
        zh: `${classZh} 成分辨識不完整`,
        en: `${classEn} ingredient mapping is incomplete`,
      },
      'not-found': {
        zh: `現有資料未見 ${classZh}`,
        en: `No ${classEn} appears in the available medication data`,
      },
    } as const
    return {
      ...labels[assessment.state],
      ...(names.length > 0 ? { sources: medicationClassSources(assessment) } : {}),
    }
  }

  const allergyFact = (
    classId: CdssMedicationClassId,
    classZh: string,
    classEn: string,
  ): CdssFact => {
    const assessment = allergyAssessments[classId]
    return assessment.state === 'documented'
      ? {
          zh: `已記載 ${classZh} 過敏／不耐受：${assessment.allergyNames.join('、')}`,
          en: `Documented ${classEn} allergy/intolerance: ${assessment.allergyNames.join(', ')}`,
          sources: assessment.sources,
        }
      : {
          zh: `過敏／不耐受紀錄未見 ${classZh}`,
          en: `No ${classEn} allergy/intolerance appears in the available record`,
        }
  }
  facts.sglt2Therapy = classFact(
    sglt2Assessment,
    'SGLT2 抑制劑',
    'SGLT2 inhibitor',
  )
  facts.statinTherapy = classFact(
    statinAssessment,
    'statin',
    'statin',
  )
  facts.aceArbTherapy = classFact(
    aceArbAssessment,
    'ACEI／ARB',
    'ACE inhibitor/ARB',
  )
  facts.finerenoneTherapy = classFact(
    finerenoneAssessment,
    'finerenone',
    'finerenone',
  )
  facts.sglt2Allergy = allergyFact('sglt2-inhibitor', 'SGLT2 抑制劑', 'SGLT2 inhibitor')
  facts.insulinAllergy = allergyFact('insulin', '胰島素', 'insulin')
  facts.sulfonylureaAllergy = allergyFact('sulfonylurea', '磺醯脲', 'sulfonylurea')
  facts.statinAllergy = allergyFact('statin', 'statin', 'statin')
  facts.aceArbAllergy = allergyFact('ace-inhibitor-or-arb', 'ACEI／ARB', 'ACE inhibitor/ARB')
  facts.finerenoneAllergy = allergyFact('finerenone', 'finerenone', 'finerenone')

  const forxigaMedications = findForxigaMedications(input.medications)
  const forxiga = forxigaMedications[0]
  let medicationContext: CdssPatientProfile['medicationContexts']
  let coverageContexts: CdssPatientProfile['coverageContexts']
  if (forxiga) {
    const sourceType = forxiga._sourceResourceType ?? 'MedicationRequest'
    const date = dateOnly(forxiga.authoredOn)
    const name = forxiga.medicationCodeableConcept?.text
      ?? forxiga.medicationCodeableConcept?.coding?.find((coding) => coding.display)?.display
      ?? 'Forxiga'
    const useState = medicationUseState(forxiga)
    const source = medicationSource(forxiga)
    facts.forxiga = {
      zh: `${name}${date ? `（${date}）` : ''}`,
      en: `${name}${date ? ` (${date})` : ''}`,
      date,
      sources: [source],
    }
    const useText = useState === 'confirmed_current'
      ? { zh: '病歷記載目前使用中；本次仍需核對', en: 'Recorded as currently used; reconcile at this visit' }
      : useState === 'active_order_unconfirmed'
        ? { zh: '病歷有有效處方，尚未確認實際服用', en: 'An active prescription is recorded; actual use is not yet confirmed' }
        : useState === 'not_current'
          ? { zh: '最新紀錄未顯示為現行用藥', en: 'The latest record is not marked as current use' }
          : { zh: '病歷無法判定目前是否使用', en: 'The record does not establish current use' }
    facts.forxigaUseStatus = { ...useText, date, sources: [source] }
    medicationContext = {
      forxiga: {
        sourceResourceType: sourceType,
        status: forxiga.status,
        useState,
      },
    }
    coverageContexts = {
      taiwanNhiSglt2: nhiSglt2CoverageContext(
        forxiga,
        forxigaMedications,
        input.carePlans,
      ),
    }
  }

  const dmEligibility = eligibilityDiagnosis
    ? {
        basis: eligibilityDiagnosis.basis,
        resourceType: eligibilityDiagnosis.resourceType,
        resourceId: eligibilityDiagnosis.resourceId,
        codingSystem: eligibilityDiagnosis.coding.system!,
        code: eligibilityDiagnosis.coding.code!,
      } as const
    : facts.HbA1c?.numericValue !== undefined && facts.HbA1c.numericValue >= 6.5
      ? {
          basis: 'hba1c_diagnostic_range',
          resourceType: 'Observation',
          resourceId: facts.HbA1c.sources?.[0]?.resourceId,
          codingSystem: LOINC_SYSTEM,
          code: HBA1C_LOINC,
        } as const
      : undefined
  const ckdEligibility = ckdDiagnosis
    ? {
        basis: ckdDiagnosis.basis,
        resourceType: ckdDiagnosis.resourceType,
        resourceId: ckdDiagnosis.resourceId,
        codingSystem: ckdDiagnosis.coding.system!,
        code: ckdDiagnosis.coding.code!,
      } as const
    : ckdCarePrograms[0]
      ? {
          basis: 'care_plan',
          resourceType: 'CarePlan',
          resourceId: ckdCarePrograms[0].id,
          codingSystem: 'https://twcore.mohw.gov.tw/CodeSystem/ckd-care-program',
          code: /末期腎臟病前期|pre-esrd/i.test(ckdCareProgramText(ckdCarePrograms[0]))
            ? 'pre-esrd'
            : 'early-ckd',
        } as const
      : persistentEgfrPair
        ? {
            basis: 'chronic_labs',
            resourceType: 'Observation',
            resourceId: persistentEgfrPair[1].id,
            codingSystem: LOINC_SYSTEM,
            code: persistentEgfrPair[1].code?.coding?.find((coding) => (
              coding.system === LOINC_SYSTEM
              && typeof coding.code === 'string'
              && EGFR_LOINC.has(coding.code)
            ))?.code ?? '77147-7',
          } as const
        : undefined

  const eligibleDiseasePackIds = [
    ...(dmEligibility ? ['dm-poc'] : []),
    ...(ckdEligibility ? ['ckd-poc'] : []),
  ]
  const diseasePackEligibility = {
    ...(dmEligibility ? { 'dm-poc': dmEligibility } : {}),
    ...(ckdEligibility ? { 'ckd-poc': ckdEligibility } : {}),
  }

  const dcsiEvidence = deriveDcsiEvidence({
    conditions: input.conditions,
    encounters: input.encounters,
    procedures: input.procedures ?? [],
    facts,
    now,
  })
  Object.assign(facts, dcsiEvidence.facts)

  const preventiveCare = derivePreventiveCareEvidence({
    observations: input.observations,
    procedures: input.procedures ?? [],
    conditions: input.conditions,
    immunizations: input.immunizations ?? [],
    now,
  })
  Object.assign(facts, preventiveCare.facts)

  const eGfrValue = facts.eGFR?.numericValue
  const quantitativeUacrValue = facts.urineAlbuminRatioQuantitative?.numericValue
    ?? (uacrUseState === 'quantitative_comparable'
      ? facts.urineAlbuminRatio?.numericValue
      : undefined)
  const kidneyIntervalDays = (
    (eGfrValue !== undefined && eGfrValue < 60)
    || (quantitativeUacrValue !== undefined && quantitativeUacrValue >= 30)
  ) ? 180 : 365
  const hba1cIntervalDays = (
    facts.HbA1c?.numericValue !== undefined
    && facts.HbA1c.numericValue <= 7
    && insulinAssessment.state !== 'confirmed-current'
    && sulfonylureaAssessment.state !== 'confirmed-current'
  ) ? 180 : 90
  const freshnessContexts = {
    HbA1c: assessFactFreshness({
      factKey: 'HbA1c',
      date: facts.HbA1c?.date,
      intervalDays: hba1cIntervalDays,
      now,
    }),
    bloodPressure: assessFactFreshness({
      factKey: 'bloodPressure',
      date: facts.bloodPressure?.date,
      intervalDays: 180,
      now,
    }),
    LDL: assessFactFreshness({
      factKey: 'LDL',
      date: facts.LDL?.date,
      intervalDays: 365,
      now,
    }),
    totalCholesterol: assessFactFreshness({
      factKey: 'totalCholesterol',
      date: facts.totalCholesterol?.date,
      intervalDays: 365,
      now,
    }),
    eGFR: assessFactFreshness({
      factKey: 'eGFR',
      date: facts.eGFR?.date,
      intervalDays: kidneyIntervalDays,
      now,
    }),
    quantitativeUacr: assessFactFreshness({
      factKey: 'urineAlbuminRatioQuantitative',
      date: facts.urineAlbuminRatioQuantitative?.date
        ?? (uacrUseState === 'quantitative_comparable'
          ? facts.urineAlbuminRatio?.date
          : undefined),
      intervalDays: kidneyIntervalDays,
      now,
    }),
  } as const

  return {
    id: `${input.patient.id}:cdss`,
    profileVersion: 'multi-disease-cdss-profile-v2',
    ...(input.patient.gender ? {
      demographics: { sex: input.patient.gender },
    } : {}),
    ...(eligibleDiseasePackIds.length > 0 ? {
      eligibleDiseasePackIds,
      diseasePackEligibility,
    } : {}),
    facts,
    medicationClassContexts: {
      insulin: {
        state: insulinAssessment.state,
        medicationNames: medicationClassNames(insulinAssessment),
        factKey: 'hypoglycemiaRiskMedications',
        ...insulinTimeline,
        allergyState: allergyAssessments.insulin.state,
        allergyNames: allergyAssessments.insulin.allergyNames,
        allergyFactKey: 'insulinAllergy',
      },
      sulfonylurea: {
        state: sulfonylureaAssessment.state,
        medicationNames: medicationClassNames(sulfonylureaAssessment),
        factKey: 'hypoglycemiaRiskMedications',
        ...sulfonylureaTimeline,
        allergyState: allergyAssessments.sulfonylurea.state,
        allergyNames: allergyAssessments.sulfonylurea.allergyNames,
        allergyFactKey: 'sulfonylureaAllergy',
      },
      'sglt2-inhibitor': {
        state: sglt2Assessment.state,
        medicationNames: medicationClassNames(sglt2Assessment),
        factKey: 'sglt2Therapy',
        ...sglt2Timeline,
        allergyState: allergyAssessments['sglt2-inhibitor'].state,
        allergyNames: allergyAssessments['sglt2-inhibitor'].allergyNames,
        allergyFactKey: 'sglt2Allergy',
      },
      statin: {
        state: statinAssessment.state,
        medicationNames: medicationClassNames(statinAssessment),
        factKey: 'statinTherapy',
        ...statinTimeline,
        allergyState: allergyAssessments.statin.state,
        allergyNames: allergyAssessments.statin.allergyNames,
        allergyFactKey: 'statinAllergy',
      },
      'ace-inhibitor-or-arb': {
        state: aceArbAssessment.state,
        medicationNames: medicationClassNames(aceArbAssessment),
        factKey: 'aceArbTherapy',
        ...aceArbTimeline,
        allergyState: allergyAssessments['ace-inhibitor-or-arb'].state,
        allergyNames: allergyAssessments['ace-inhibitor-or-arb'].allergyNames,
        allergyFactKey: 'aceArbAllergy',
      },
      finerenone: {
        state: finerenoneAssessment.state,
        medicationNames: medicationClassNames(finerenoneAssessment),
        factKey: 'finerenoneTherapy',
        ...finerenoneTimeline,
        allergyState: allergyAssessments.finerenone.state,
        allergyNames: allergyAssessments.finerenone.allergyNames,
        allergyFactKey: 'finerenoneAllergy',
      },
    },
    ...(medicationContext ? { medicationContexts: medicationContext } : {}),
    ...(coverageContexts ? { coverageContexts } : {}),
    freshnessContexts,
    screeningContexts: preventiveCare.screeningContexts,
    ...(uacrUseState ? {
      observationContexts: {
        uacr: {
          useState: uacrUseState,
          readings: uacrReadings,
          latestReading: latestUacrReading,
          latestQuantitativeReading,
        },
      },
    } : {}),
    ...(Object.keys(dcsiEvidence.contexts).length > 0 ? {
      dcsiDomainContexts: dcsiEvidence.contexts,
    } : {}),
  }
}
