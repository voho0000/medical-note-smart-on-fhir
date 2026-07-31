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
import {
  assessAkiFromCreatinine,
  type AkiCreatinineReading,
} from '../risk-stratification/aki'

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
const SERUM_CREATININE_MG_DL_UNITS = new Set(['mg/dl'])
const SERUM_CREATININE_UMOL_L_UNITS = new Set(['umol/l'])
const SERUM_CREATININE_MMOL_L_UNITS = new Set(['mmol/l'])
const HEMOGLOBIN_LOINC = '718-7'
const MCV_LOINC = '787-2'
const RETICULOCYTE_PERCENT_LOINC = '4679-7'
const RETICULOCYTE_ABSOLUTE_LOINC = '14196-0'
const FERRITIN_LOINC = '2276-4'
const TSAT_LOINC = '2502-3'
const VITAMIN_B12_LOINC = '2132-9'
const FOLATE_LOINC = '2284-8'
const CRP_LOINC = '1988-5'
const LDH_LOINC = '2532-0'
const HAPTOGLOBIN_LOINC = '4542-7'
const TSH_LOINC = '3016-3'
const PLATELET_LOINC = new Set(['777-3', '26515-7'])
const TOTAL_BILIRUBIN_LOINC = new Set(['1975-2', '42719-5'])
const INR_LOINC = '6301-6'
const AFP_LOINC = '1834-1'
const LIVER_STIFFNESS_LOINC = '77791-7'
const BICARBONATE_LOINC = new Set(['1963-8', '2028-9'])
const CALCIUM_LOINC = new Set(['17861-6', '2000-8'])
const PHOSPHATE_LOINC = new Set(['2777-1'])
const PARATHYROID_HORMONE_LOINC = new Set(['2731-8'])
const ALKALINE_PHOSPHATASE_LOINC = new Set(['6768-6'])
const ALBUMIN_LOINC = new Set(['1751-7'])
const POTASSIUM_LOINC = '2823-3'
const TOTAL_CHOLESTEROL_LOINC = '2093-3'
const LDL_LOINC = new Set(['13457-7', '18262-6', '2089-1'])
const HDL_LOINC = '2085-9'
const TRIGLYCERIDE_LOINC = '2571-8'
const APOB_LOINC = '1884-6'
const LIPOPROTEIN_A_MASS_LOINC = '10835-7'
const LIPOPROTEIN_A_MOLAR_LOINC = '43583-4'
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
const LVEF_LOINC = '10230-1'
const BNP_LOINC = '30934-4'
const NT_PRO_BNP_LOINC = '33762-6'
const HEART_RATE_LOINC = '8867-4'
const BODY_WEIGHT_LOINC = '29463-7'
const SODIUM_LOINC = '2951-2'
const FORXIGA_NHI_CODE = 'BC26476100'
const LIVER_ULTRASOUND_CPT_CODES = new Set(['76700', '76705'])
const UPPER_ENDOSCOPY_CPT_CODES = new Set([
  '43200', '43202', '43226', '43227', '43229', '43231', '43232', '43235',
  '43236', '43237', '43238', '43239', '43241', '43242', '43243', '43244',
  '43245', '43246', '43247', '43248', '43249', '43251', '43253', '43254',
  '43255', '43257', '43259', '43266', '43270', '43274', '43275', '43276',
])
const TRANSIENT_ELASTOGRAPHY_CPT_CODES = new Set(['91200'])

const ACCEPTED_OBSERVATION_STATUS = new Set(['final', 'amended', 'corrected'])
const EXCLUDED_CONDITION_STATUS = new Set(['inactive', 'resolved', 'entered-in-error'])
const EXCLUDED_VERIFICATION_STATUS = new Set(['refuted', 'entered-in-error'])
const EXCLUDED_ENCOUNTER_STATUS = new Set(['cancelled', 'entered-in-error'])
const EXCLUDED_MEDICATION_STATUS = new Set(['cancelled', 'entered-in-error'])
const ACCEPTED_PROCEDURE_STATUS = new Set(['completed', 'in-progress'])
const COMMON_NSAID_PATTERN = /\b(?:ibuprofen|naproxen|diclofenac|ketorolac|celecoxib|etoricoxib|indomethacin|mefenamic acid|meloxicam|piroxicam|nsaid)\b|布洛芬|萘普生|雙氯芬酸|酮咯酸|塞來昔布|依托考昔|吲哚美辛|甲芬那酸|美洛昔康|非類固醇消炎/i
const HF_WORSENING_MEDICATION_PATTERN = /\b(?:pioglitazone|rosiglitazone|saxagliptin|alogliptin|diltiazem|verapamil|flecainide|dronedarone)\b|吡格列酮|羅格列酮|沙格列汀|阿格列汀|地爾硫卓|維拉帕米|氟卡尼|決奈達隆/i
const HYPERKALEMIA_RISK_MEDICATION_PATTERN = /\b(?:lisinopril|enalapril|ramipril|perindopril|captopril|losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan|spironolactone|eplerenone|finerenone|amiloride|triamterene|trimethoprim|pentamidine|tacrolimus|cyclosporine|digoxin|heparin|potassium chloride|potassium supplement)\b|血管張力素轉化酶抑制劑|血管張力素受體阻斷劑|螺內酯|依普利酮|非奈利酮|保鉀利尿劑|甲氧苄啶|他克莫司|環孢素|鉀補充/i
const POTENTIAL_NEPHROTOXIN_PATTERN = /\b(?:ibuprofen|naproxen|diclofenac|ketorolac|celecoxib|etoricoxib|indomethacin|mefenamic acid|meloxicam|piroxicam|gentamicin|amikacin|tobramycin|streptomycin|vancomycin|amphotericin b|lithium|tacrolimus|cyclosporine|tenofovir)\b|非類固醇消炎|慶大黴素|阿米卡星|妥布黴素|萬古黴素|兩性黴素|鋰鹽|他克莫司|環孢素|替諾福韋/i
const DOAC_PATTERN = /\b(?:apixaban|rivaroxaban|edoxaban|dabigatran|B01AF\d{2}|B01AE07)\b|阿哌沙班|利伐沙班|艾多沙班|達比加群/i
const VITAMIN_K_ANTAGONIST_PATTERN = /\b(?:warfarin|acenocoumarol|B01AA\d{2})\b|華法林|可邁丁/i
const ANTIPLATELET_PATTERN = /\b(?:aspirin|clopidogrel|prasugrel|ticagrelor|dipyridamole|cilostazol|B01AC\d{2})\b|阿斯匹靈|氯吡格雷|普拉格雷|替格瑞洛|雙嘧達莫|西洛他唑/i

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

function procedureSource(procedure: ProcedureEntity): CdssFactSource {
  return {
    resourceType: 'Procedure',
    resourceId: procedure.id,
    date: dateOnly(procedure.performedDateTime ?? procedure.performedPeriod?.start),
    status: procedure.status,
    value: procedure.note?.map((note) => note.text).filter(Boolean).join('；'),
    coding: procedure.code?.coding,
    facility: procedure.performer?.find((performer) => (
      performer.actor?.display ?? performer.display
    ))?.actor?.display
      ?? procedure.performer?.find((performer) => performer.display)?.display,
    sourceSystem: procedure.sourceSystem,
  }
}

function procedureSearchText(procedure: ProcedureEntity): string {
  return [
    procedure.code?.text,
    ...(procedure.code?.coding ?? []).flatMap((coding) => [
      coding.code,
      coding.display,
    ]),
    ...(procedure.note ?? []).map((note) => note.text),
  ].filter(Boolean).join(' ')
}

function hasProcedureCode(
  procedure: ProcedureEntity,
  codes: ReadonlySet<string>,
): boolean {
  return procedure.code?.coding?.some((coding) => {
    const system = (coding.system ?? '').toLowerCase()
    return Boolean(
      coding.code
      && codes.has(coding.code.toUpperCase())
      && (system.includes('cpt') || system.includes('hcpcs')),
    )
  }) === true
}

function latestProcedureFact(input: {
  procedures: readonly ProcedureEntity[]
  matches: (procedure: ProcedureEntity, text: string) => boolean
  labelZh: string
  labelEn: string
}): CdssFact | undefined {
  const matches = input.procedures
    .filter((procedure) => (
      Boolean(procedure.id)
      && Boolean(dateOnly(procedure.performedDateTime ?? procedure.performedPeriod?.start))
      && ACCEPTED_PROCEDURE_STATUS.has((procedure.status ?? '').toLowerCase())
      && input.matches(procedure, procedureSearchText(procedure))
    ))
    .sort((a, b) => (
      dateValue(b.performedDateTime ?? b.performedPeriod?.start)
      - dateValue(a.performedDateTime ?? a.performedPeriod?.start)
    ))
  const latest = matches[0]
  if (!latest) return undefined
  const date = dateOnly(latest.performedDateTime ?? latest.performedPeriod?.start)
  const result = latest.note?.map((note) => note.text).filter(Boolean).join('；')
  return {
    zh: `${input.labelZh}${result ? `：${result}` : ''}${date ? `（${date}）` : ''}`,
    en: `${input.labelEn}${result ? `: ${result}` : ''}${date ? ` (${date})` : ''}`,
    date,
    sources: matches.map(procedureSource),
  }
}

function medicationSearchText(medication: MedicationEntity): string {
  return [
    medicationDisplayName(medication),
    medication.medicationReference?.display,
    medication.drugTerminology?.officialNameZh,
    medication.drugTerminology?.officialNameEn,
    medication.drugTerminology?.ingredientText,
    medication.drugTerminology?.atcCode,
    medication.drugTerminology?.atcNameZh,
    medication.drugTerminology?.atcNameEn,
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

function currentPotentialHfWorseningMedicationFact(
  medications: readonly MedicationEntity[],
): CdssFact | undefined {
  const matches = currentMedicationRecords(medications)
    .filter((medication) => HF_WORSENING_MEDICATION_PATTERN.test(medicationSearchText(medication)))
  if (matches.length === 0) return undefined
  const names = matches.map(medicationDisplayName)
  return {
    zh: `辨識到需依心衰竭分型與適應症重新核對的藥物：${names.join('、')}`,
    en: `Medication(s) requiring review against HF phenotype and indication: ${names.join(', ')}`,
    sources: matches.map(medicationSource),
  }
}

function currentMedicationPatternFact(
  medications: readonly MedicationEntity[],
  pattern: RegExp,
  labelZh: string,
  labelEn: string,
): CdssFact | undefined {
  const matches = currentMedicationRecords(medications)
    .filter((medication) => pattern.test(medicationSearchText(medication)))
  if (matches.length === 0) return undefined
  const names = matches.map(medicationDisplayName)
  return {
    zh: `${labelZh}：${names.join('、')}`,
    en: `${labelEn}: ${names.join(', ')}`,
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

function validatedObservations(
  observations: readonly ObservationEntity[],
  code: string,
  acceptedUnits: ReadonlySet<string>,
): ObservationEntity[] {
  return observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && hasCoding(observation.code?.coding, LOINC_SYSTEM, code)
      && hasExpectedUnit(observation.valueQuantity, acceptedUnits)
    ))
    .sort((a, b) => dateValue(a.effectiveDateTime) - dateValue(b.effectiveDateTime))
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

function serumCreatinineValueMgDl(
  observation: ObservationEntity,
): number | undefined {
  const quantity = observation.valueQuantity
  if (!quantity || typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    return undefined
  }
  if (quantity.system && quantity.system !== UCUM_SYSTEM) return undefined
  const units = [quantity.code, quantity.unit].map(normalizedUnit).filter(Boolean)
  if (units.some((unit) => SERUM_CREATININE_MG_DL_UNITS.has(unit))) {
    return quantity.value
  }
  if (units.some((unit) => SERUM_CREATININE_UMOL_L_UNITS.has(unit))) {
    return quantity.value / 88.42
  }
  if (units.some((unit) => SERUM_CREATININE_MMOL_L_UNITS.has(unit))) {
    return quantity.value * (1000 / 88.42)
  }
  return undefined
}

function validatedSerumCreatinineReadings(
  observations: readonly ObservationEntity[],
): AkiCreatinineReading<CdssFactSource>[] {
  return observations
    .flatMap((observation): AkiCreatinineReading<CdssFactSource>[] => {
      if (
        !isGovernedObservation(observation)
        || !hasCoding(observation.code?.coding, LOINC_SYSTEM, SERUM_CREATININE_LOINC)
      ) {
        return []
      }
      const valueMgDl = serumCreatinineValueMgDl(observation)
      if (valueMgDl === undefined || valueMgDl <= 0) return []
      const roundedValue = Math.round(valueMgDl * 100) / 100
      return [{
        observedAt: observation.effectiveDateTime!,
        valueMgDl: roundedValue,
        source: observationSource(observation, roundedValue, 'mg/dL'),
      }]
    })
    .sort((a, b) => dateValue(a.observedAt) - dateValue(b.observedAt))
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
  const match = normalized.match(/(?:>=|≥|>)\s*(\d+(?:\.\d+)?)/)
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
    sources: candidates.map((candidate) => observationSource(
      candidate.observation,
      `${candidate.systolic}/${candidate.diastolic}`,
      'mmHg',
    )),
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
  if (eligibilityDiagnosis) {
    facts.type2DiabetesDiagnosis = diagnosisFact(
      eligibilityDiagnosis,
      '第二型糖尿病',
      'Type 2 diabetes',
    )
  }
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
  const cirrhosisDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:K70\.3[01]|K71\.7|K74\.(?:3|4|5|6(?:0|9)?))(?:\.|$)/.test(code),
  )
  if (cirrhosisDiagnosis) {
    facts.cirrhosisDiagnosis = diagnosisFact(
      cirrhosisDiagnosis,
      '肝硬化',
      'Cirrhosis',
    )
  }
  const atrialFibrillationDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^I48(?:\.|$)/.test(code),
  )
  if (atrialFibrillationDiagnosis) {
    facts.atrialFibrillationDiagnosis = diagnosisFact(
      atrialFibrillationDiagnosis,
      '心房顫動／心房撲動',
      'Atrial fibrillation/flutter',
    )
  }
  const priorStrokeTiaEmbolism = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I63|I64|G45|I74)(?:\.|$)/.test(code),
  )
  if (priorStrokeTiaEmbolism) {
    facts.priorStrokeTiaEmbolism = diagnosisFact(
      priorStrokeTiaEmbolism,
      '缺血性中風／TIA／全身性栓塞病史',
      'Prior ischemic stroke/TIA/systemic embolism',
    )
  }
  const vascularDisease = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I21|I22|I25\.2|I70|I73\.9)(?:\.|$)/.test(code),
  )
  if (vascularDisease) {
    facts.vascularDisease = diagnosisFact(
      vascularDisease,
      '心肌梗塞／周邊動脈疾病',
      'Myocardial infarction/peripheral arterial disease',
    )
  }
  const rheumaticMitralStenosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^I05\.(?:0|2)(?:\.|$)/.test(code),
  )
  if (rheumaticMitralStenosis) {
    facts.rheumaticMitralStenosis = diagnosisFact(
      rheumaticMitralStenosis,
      '風濕性二尖瓣狹窄',
      'Rheumatic mitral stenosis',
    )
  }
  const prostheticHeartValve = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^Z95\.2(?:\.|$)/.test(code),
  )
  if (prostheticHeartValve) {
    facts.prostheticHeartValve = diagnosisFact(
      prostheticHeartValve,
      '人工心臟瓣膜狀態（種類未由此代碼確定）',
      'Prosthetic heart valve status (type not established by this code)',
    )
  }
  const majorBleedingHistory = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I6[0-2]|K92\.2|D62)(?:\.|$)/.test(code),
  )
  if (majorBleedingHistory) {
    facts.majorBleedingHistory = diagnosisFact(
      majorBleedingHistory,
      '重大出血／急性失血病史',
      'Major bleeding/acute blood-loss history',
    )
  }
  const portalHypertensionDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^K76\.6(?:\.|$)/.test(code),
  )
  if (portalHypertensionDiagnosis) {
    facts.portalHypertensionDiagnosis = diagnosisFact(
      portalHypertensionDiagnosis,
      '門脈高壓',
      'Portal hypertension',
    )
  }
  const ascitesDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:R18(?:\.|$)|K70\.31(?:\.|$))/.test(code),
  )
  if (ascitesDiagnosis) {
    facts.ascitesDiagnosis = diagnosisFact(
      ascitesDiagnosis,
      '腹水',
      'Ascites',
    )
  }
  const hepaticEncephalopathyDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^K76\.82(?:\.|$)/.test(code),
  )
  if (hepaticEncephalopathyDiagnosis) {
    facts.hepaticEncephalopathyDiagnosis = diagnosisFact(
      hepaticEncephalopathyDiagnosis,
      '肝性腦病變',
      'Hepatic encephalopathy',
    )
  }
  const esophagealVaricesDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^(?:I85|I86\.4)(?:\.|$)/.test(code),
  )
  if (esophagealVaricesDiagnosis) {
    facts.esophagealVaricesDiagnosis = diagnosisFact(
      esophagealVaricesDiagnosis,
      '胃食道靜脈曲張',
      'Gastroesophageal varices',
    )
  }
  const varicealBleedingDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^I85\.(?:0|1)1(?:\.|$)/.test(code),
  )
  if (varicealBleedingDiagnosis) {
    facts.varicealBleedingDiagnosis = diagnosisFact(
      varicealBleedingDiagnosis,
      '靜脈曲張出血',
      'Variceal bleeding',
    )
  }
  const spontaneousBacterialPeritonitisDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^K65\.2(?:\.|$)/.test(code),
  )
  if (spontaneousBacterialPeritonitisDiagnosis) {
    facts.spontaneousBacterialPeritonitisDiagnosis = diagnosisFact(
      spontaneousBacterialPeritonitisDiagnosis,
      '自發性細菌性腹膜炎',
      'Spontaneous bacterial peritonitis',
    )
  }
  const hepatorenalSyndromeDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^K76\.7(?:\.|$)/.test(code),
  )
  if (hepatorenalSyndromeDiagnosis) {
    facts.hepatorenalSyndromeDiagnosis = diagnosisFact(
      hepatorenalSyndromeDiagnosis,
      '肝腎症候群',
      'Hepatorenal syndrome',
    )
  }
  const hepatocellularCarcinomaDiagnosis = latestDiagnosis(
    input.conditions,
    input.encounters,
    (code) => /^C22\.0(?:\.|$)/.test(code),
  )
  if (hepatocellularCarcinomaDiagnosis) {
    facts.hepatocellularCarcinomaDiagnosis = diagnosisFact(
      hepatocellularCarcinomaDiagnosis,
      '肝細胞癌',
      'Hepatocellular carcinoma',
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

  const lvefValues = input.observations
    .filter((observation) => (
      isGovernedObservation(observation)
      && hasCoding(observation.code?.coding, LOINC_SYSTEM, LVEF_LOINC)
      && hasExpectedUnit(observation.valueQuantity, new Set(['%']))
      && observation.valueQuantity?.value !== undefined
      && observation.valueQuantity.value >= 0
      && observation.valueQuantity.value <= 100
    ))
    .sort((a, b) => dateValue(a.effectiveDateTime) - dateValue(b.effectiveDateTime))
  const latestLvef = lvefValues.at(-1)
  if (latestLvef) {
    const lvefFact = observationFact(latestLvef, '%')
    if (lvefFact) facts.LVEF = lvefFact
  }
  if (lvefValues.length >= 2) {
    const sources = lvefValues.slice(-6).map((observation) => observationSource(
      observation,
      observation.valueQuantity!.value!,
      '%',
    ))
    const trend = sources.map((source) => `${source.date} ${source.value}%`).join(' → ')
    facts.LVEFTrend = {
      zh: trend,
      en: trend,
      numericValue: latestLvef?.valueQuantity?.value,
      unit: '%',
      date: dateOnly(latestLvef?.effectiveDateTime),
      sources,
    }
  }

  const bnp = findLatestValidatedObservation(
    input.observations,
    BNP_LOINC,
    new Set(['pg/ml', 'ng/l']),
  )
  const bnpFact = bnp ? observationFact(bnp, 'pg/mL') : undefined
  if (bnpFact) facts.BNP = bnpFact

  const ntProBnp = findLatestValidatedObservation(
    input.observations,
    NT_PRO_BNP_LOINC,
    new Set(['pg/ml', 'ng/l']),
  )
  const ntProBnpFact = ntProBnp ? observationFact(ntProBnp, 'pg/mL') : undefined
  if (ntProBnpFact) facts.NTproBNP = ntProBnpFact

  const heartRate = findLatestValidatedObservation(
    input.observations,
    HEART_RATE_LOINC,
    new Set(['/min', '{beats}/min', 'beats/min', 'bpm']),
  )
  const heartRateFact = heartRate ? observationFact(heartRate, 'bpm') : undefined
  if (heartRateFact) facts.heartRate = heartRateFact

  const bodyWeight = findLatestValidatedObservation(
    input.observations,
    BODY_WEIGHT_LOINC,
    new Set(['kg']),
  )
  const bodyWeightFact = bodyWeight ? observationFact(bodyWeight, 'kg') : undefined
  if (bodyWeightFact) facts.bodyWeight = bodyWeightFact

  const sodium = findLatestValidatedObservation(
    input.observations,
    SODIUM_LOINC,
    new Set(['mmol/l', 'meq/l']),
  )
  const sodiumFact = sodium ? observationFact(sodium, 'mmol/L') : undefined
  if (sodiumFact) facts.sodium = sodiumFact

  const potassium = findLatestValidatedObservation(
    input.observations,
    POTASSIUM_LOINC,
    new Set(['mmol/l', 'meq/l']),
  )
  const potassiumFact = potassium ? observationFact(potassium, 'mmol/L') : undefined
  if (potassiumFact) facts.potassium = potassiumFact

  const serumCreatinineReadings = validatedSerumCreatinineReadings(input.observations)
  const latestSerumCreatinine = serumCreatinineReadings.at(-1)
  if (latestSerumCreatinine) {
    const date = dateOnly(latestSerumCreatinine.observedAt)
    facts.serumCreatinine = {
      zh: `${latestSerumCreatinine.valueMgDl} mg/dL${date ? `（${date}）` : ''}`,
      en: `${latestSerumCreatinine.valueMgDl} mg/dL${date ? ` (${date})` : ''}`,
      numericValue: latestSerumCreatinine.valueMgDl,
      unit: 'mg/dL',
      date,
      sources: [latestSerumCreatinine.source],
    }
  }
  if (serumCreatinineReadings.length >= 2) {
    const trendReadings = serumCreatinineReadings.slice(-6)
    const trend = trendReadings
      .map((reading) => `${dateOnly(reading.observedAt)} ${reading.valueMgDl}`)
      .join(' → ')
    facts.serumCreatinineTrend = {
      zh: `${trend} mg/dL`,
      en: `${trend} mg/dL`,
      numericValue: latestSerumCreatinine?.valueMgDl,
      unit: 'mg/dL',
      date: dateOnly(latestSerumCreatinine?.observedAt),
      sources: trendReadings.map((reading) => reading.source),
    }
  }
  const akiAssessment = assessAkiFromCreatinine(serumCreatinineReadings, now)
  if (akiAssessment.event) {
    const { event } = akiAssessment
    const baselineDate = dateOnly(event.baseline.observedAt)
    const currentDate = dateOnly(event.current.observedAt)
    const ratioText = event.ratioRise7d !== undefined
      ? `${event.ratioRise7d.toFixed(2)} 倍`
      : '未達可計算條件'
    const absoluteText = event.absoluteRise48hMgDl !== undefined
      ? `+${event.absoluteRise48hMgDl.toFixed(2)} mg/dL`
      : '未達可計算條件'
    facts.akiCreatinineSignal = {
      zh: `KDIGO creatinine 訊號第 ${event.stage} 期：${event.baseline.valueMgDl} → ${event.current.valueMgDl} mg/dL（${baselineDate} → ${currentDate}；7 日比值 ${ratioText}；48 小時變化 ${absoluteText}）`,
      en: `KDIGO creatinine signal, stage ${event.stage}: ${event.baseline.valueMgDl} to ${event.current.valueMgDl} mg/dL (${baselineDate} to ${currentDate}; 7-day ratio ${event.ratioRise7d?.toFixed(2) ?? 'not evaluable'}; 48-hour change ${event.absoluteRise48hMgDl !== undefined ? `+${event.absoluteRise48hMgDl.toFixed(2)} mg/dL` : 'not evaluable'})`,
      numericValue: event.stage,
      date: currentDate,
      sources: [event.baseline.source, event.current.source],
    }
  }

  const hemoglobinReadings = validatedObservations(
    input.observations,
    HEMOGLOBIN_LOINC,
    new Set(['g/dl']),
  )
  const hemoglobin = hemoglobinReadings.at(-1)
  const hemoglobinFact = hemoglobin ? observationFact(hemoglobin, 'g/dL') : undefined
  if (hemoglobinFact) facts.hemoglobin = hemoglobinFact
  if (hemoglobinReadings.length >= 2) {
    const trendReadings = hemoglobinReadings.slice(-6)
    const sources = trendReadings.map((observation) => observationSource(
      observation,
      observation.valueQuantity!.value!,
      'g/dL',
    ))
    const trend = sources.map((source) => `${source.date} ${source.value}`).join(' → ')
    facts.hemoglobinTrend = {
      zh: `${trend} g/dL`,
      en: `${trend} g/dL`,
      numericValue: hemoglobin?.valueQuantity?.value,
      unit: 'g/dL',
      date: dateOnly(hemoglobin?.effectiveDateTime),
      sources,
    }
  }

  const anemiaLabs: readonly {
    key: string
    code: string
    units: ReadonlySet<string>
    displayUnit: string
  }[] = [
    { key: 'meanCorpuscularVolume', code: MCV_LOINC, units: new Set(['fl']), displayUnit: 'fL' },
    { key: 'reticulocytePercent', code: RETICULOCYTE_PERCENT_LOINC, units: new Set(['%']), displayUnit: '%' },
    { key: 'reticulocyteAbsolute', code: RETICULOCYTE_ABSOLUTE_LOINC, units: new Set(['10*3/ul', '10^3/ul', '10*9/l', '10^9/l']), displayUnit: '×10³/µL' },
    { key: 'ferritin', code: FERRITIN_LOINC, units: new Set(['ng/ml', 'ug/l']), displayUnit: 'ng/mL' },
    { key: 'transferrinSaturation', code: TSAT_LOINC, units: new Set(['%']), displayUnit: '%' },
    { key: 'vitaminB12', code: VITAMIN_B12_LOINC, units: new Set(['pg/ml', 'ng/l']), displayUnit: 'pg/mL' },
    { key: 'folate', code: FOLATE_LOINC, units: new Set(['ng/ml', 'ug/l']), displayUnit: 'ng/mL' },
    { key: 'cReactiveProtein', code: CRP_LOINC, units: new Set(['mg/l']), displayUnit: 'mg/L' },
    { key: 'lactateDehydrogenase', code: LDH_LOINC, units: new Set(['u/l', '[iu]/l', 'iu/l']), displayUnit: 'U/L' },
    { key: 'haptoglobin', code: HAPTOGLOBIN_LOINC, units: new Set(['mg/dl']), displayUnit: 'mg/dL' },
    { key: 'thyroidStimulatingHormone', code: TSH_LOINC, units: new Set(['miu/l', 'uiu/ml', 'mu/l']), displayUnit: 'mIU/L' },
  ]
  anemiaLabs.forEach(({ key, code, units, displayUnit }) => {
    const observation = findLatestValidatedObservation(input.observations, code, units)
    const fact = observation ? observationFact(observation, displayUnit) : undefined
    if (fact) facts[key] = fact
  })

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

  const plateletCount = findLatestValidatedObservationFromCodes(
    input.observations,
    PLATELET_LOINC,
    new Set([
      '10*3/ul', '10^3/ul', '10*9/l', '10^9/l', 'k/ul', 'x10^3/ul',
    ]),
  )
  const plateletCountFact = plateletCount
    ? observationFact(plateletCount, '×10³/µL')
    : undefined
  if (plateletCountFact) facts.plateletCount = plateletCountFact

  const totalBilirubin = findLatestValidatedObservationFromCodes(
    input.observations,
    TOTAL_BILIRUBIN_LOINC,
    new Set(['mg/dl']),
  )
  const totalBilirubinFact = totalBilirubin
    ? observationFact(totalBilirubin, 'mg/dL')
    : undefined
  if (totalBilirubinFact) facts.totalBilirubin = totalBilirubinFact

  const inr = findLatestValidatedObservation(
    input.observations,
    INR_LOINC,
    new Set(['1', '{inr}', 'ratio']),
  )
  const inrFact = inr ? observationFact(inr, 'INR') : undefined
  if (inrFact) facts.INR = inrFact

  const alphaFetoprotein = findLatestValidatedObservation(
    input.observations,
    AFP_LOINC,
    new Set(['ng/ml', 'ug/l']),
  )
  const alphaFetoproteinFact = alphaFetoprotein
    ? observationFact(alphaFetoprotein, 'ng/mL')
    : undefined
  if (alphaFetoproteinFact) facts.AFP = alphaFetoproteinFact

  const liverStiffness = findLatestValidatedObservation(
    input.observations,
    LIVER_STIFFNESS_LOINC,
    new Set(['kpa']),
  )
  const liverStiffnessFact = liverStiffness
    ? observationFact(liverStiffness, 'kPa')
    : undefined
  if (liverStiffnessFact) facts.liverStiffness = liverStiffnessFact

  const procedures = input.procedures ?? []
  const liverUltrasound = latestProcedureFact({
    procedures,
    matches: (procedure, searchable) => (
      hasProcedureCode(procedure, LIVER_ULTRASOUND_CPT_CODES)
      || /(?:liver|hepatic|肝臟?|肝膽).*(?:ultrasound|sonograph|超音波)|(?:ultrasound|sonograph|超音波).*(?:liver|hepatic|肝臟?|肝膽)/i.test(searchable)
    ),
    labelZh: '肝臟／腹部超音波候選紀錄',
    labelEn: 'Liver/abdominal ultrasound candidate record',
  })
  if (liverUltrasound) facts.liverUltrasound = liverUltrasound

  const upperEndoscopy = latestProcedureFact({
    procedures,
    matches: (procedure, searchable) => (
      hasProcedureCode(procedure, UPPER_ENDOSCOPY_CPT_CODES)
      || /(?:upper (?:gi |gastrointestinal )?endoscop|esophagogastroduodenoscop|gastroscop|胃鏡|上消化道內視鏡)/i.test(searchable)
    ),
    labelZh: '上消化道內視鏡',
    labelEn: 'Upper gastrointestinal endoscopy',
  })
  if (upperEndoscopy) facts.upperEndoscopy = upperEndoscopy

  const transientElastography = latestProcedureFact({
    procedures,
    matches: (procedure, searchable) => (
      hasProcedureCode(procedure, TRANSIENT_ELASTOGRAPHY_CPT_CODES)
      || /(?:fibroscan|transient elastograph|肝(?:臟)?彈性(?:掃描|檢查)?)/i.test(searchable)
    ),
    labelZh: '肝臟瞬時彈性檢查',
    labelEn: 'Transient liver elastography',
  })
  if (transientElastography) facts.transientElastography = transientElastography

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

  const hdl = findLatestValidatedObservation(
    input.observations,
    HDL_LOINC,
    new Set(['mg/dl']),
  )
  const hdlFact = hdl ? observationFact(hdl, 'mg/dL') : undefined
  if (hdlFact) facts.HDL = hdlFact

  const triglycerides = findLatestValidatedObservation(
    input.observations,
    TRIGLYCERIDE_LOINC,
    new Set(['mg/dl']),
  )
  const triglycerideFact = triglycerides
    ? observationFact(triglycerides, 'mg/dL')
    : undefined
  if (triglycerideFact) facts.triglycerides = triglycerideFact

  const apoB = findLatestValidatedObservation(
    input.observations,
    APOB_LOINC,
    new Set(['mg/dl']),
  )
  const apoBFact = apoB ? observationFact(apoB, 'mg/dL') : undefined
  if (apoBFact) facts.apolipoproteinB = apoBFact

  const lipoproteinAMass = findLatestValidatedObservation(
    input.observations,
    LIPOPROTEIN_A_MASS_LOINC,
    new Set(['mg/dl']),
  )
  const lipoproteinAMolar = findLatestValidatedObservation(
    input.observations,
    LIPOPROTEIN_A_MOLAR_LOINC,
    new Set(['nmol/l']),
  )
  const lipoproteinA = [lipoproteinAMass, lipoproteinAMolar]
    .filter((value): value is ObservationEntity => Boolean(value))
    .sort((a, b) => dateValue(b.effectiveDateTime) - dateValue(a.effectiveDateTime))[0]
  if (lipoproteinA) {
    const isMolar = hasCoding(
      lipoproteinA.code?.coding,
      LOINC_SYSTEM,
      LIPOPROTEIN_A_MOLAR_LOINC,
    )
    const lipoproteinAFact = observationFact(
      lipoproteinA,
      isMolar ? 'nmol/L' : 'mg/dL',
    )
    if (lipoproteinAFact) facts.lipoproteinA = lipoproteinAFact
  }

  if (
    totalCholesterolFact?.numericValue !== undefined
    && hdlFact?.numericValue !== undefined
    && totalCholesterolFact.date
    && totalCholesterolFact.date === hdlFact.date
    && totalCholesterolFact.numericValue >= hdlFact.numericValue
  ) {
    const nonHdl = Math.round(
      (totalCholesterolFact.numericValue - hdlFact.numericValue) * 10,
    ) / 10
    facts.nonHDL = {
      zh: `${nonHdl} mg/dL（總膽固醇 − HDL-C；${totalCholesterolFact.date}）`,
      en: `${nonHdl} mg/dL (total cholesterol − HDL-C; ${totalCholesterolFact.date})`,
      numericValue: nonHdl,
      unit: 'mg/dL',
      date: totalCholesterolFact.date,
      sources: [
        ...(totalCholesterolFact.sources ?? []),
        ...(hdlFact.sources ?? []),
      ],
    }
  }

  const medicationListOverview = currentMedicationOverviewFact(input.medications)
  if (medicationListOverview) facts.medicationListOverview = medicationListOverview
  const currentNsaid = currentNsaidFact(input.medications)
  if (currentNsaid) facts.currentNsaid = currentNsaid
  const currentPotentialHfWorseningMedication = currentPotentialHfWorseningMedicationFact(
    input.medications,
  )
  if (currentPotentialHfWorseningMedication) {
    facts.currentPotentialHfWorseningMedication = currentPotentialHfWorseningMedication
  }
  const medicationPatternFacts = [
    {
      key: 'currentHyperkalemiaRiskMedication',
      pattern: HYPERKALEMIA_RISK_MEDICATION_PATTERN,
      zh: '辨識到可能升高血鉀的現行藥物',
      en: 'Current medication(s) that may raise potassium',
    },
    {
      key: 'currentPotentialNephrotoxin',
      pattern: POTENTIAL_NEPHROTOXIN_PATTERN,
      zh: '辨識到需核對的潛在腎毒性藥物',
      en: 'Potential nephrotoxic medication(s) requiring reconciliation',
    },
    {
      key: 'currentDoac',
      pattern: DOAC_PATTERN,
      zh: '辨識到直接口服抗凝血劑',
      en: 'Direct oral anticoagulant record(s)',
    },
    {
      key: 'currentVitaminKAntagonist',
      pattern: VITAMIN_K_ANTAGONIST_PATTERN,
      zh: '辨識到 vitamin K antagonist',
      en: 'Vitamin K antagonist record(s)',
    },
    {
      key: 'currentAntiplatelet',
      pattern: ANTIPLATELET_PATTERN,
      zh: '辨識到抗血小板藥物',
      en: 'Antiplatelet record(s)',
    },
  ] as const
  medicationPatternFacts.forEach(({ key, pattern, zh, en }) => {
    const fact = currentMedicationPatternFact(input.medications, pattern, zh, en)
    if (fact) facts[key] = fact
  })
  if (facts.currentDoac || facts.currentVitaminKAntagonist) {
    const sources = [
      ...(facts.currentDoac?.sources ?? []),
      ...(facts.currentVitaminKAntagonist?.sources ?? []),
    ]
    facts.currentOralAnticoagulant = {
      zh: [facts.currentDoac?.zh, facts.currentVitaminKAntagonist?.zh].filter(Boolean).join('；'),
      en: [facts.currentDoac?.en, facts.currentVitaminKAntagonist?.en].filter(Boolean).join('; '),
      sources,
    }
  }

  const classifiedMedications = classifyCurrentMedications(input.medications)
  const allergyAssessments = assessMedicationClassAllergies(input.allergies)
  const insulinAssessment = assessMedicationClass(classifiedMedications, 'insulin')
  const sulfonylureaAssessment = assessMedicationClass(classifiedMedications, 'sulfonylurea')
  const sglt2Assessment = assessMedicationClass(classifiedMedications, 'sglt2-inhibitor')
  const arniAssessment = assessMedicationClass(classifiedMedications, 'arni')
  const hfEvidenceBetaBlockerAssessment = assessMedicationClass(
    classifiedMedications,
    'hf-evidence-based-beta-blocker',
  )
  const loopDiureticAssessment = assessMedicationClass(classifiedMedications, 'loop-diuretic')
  const statinAssessment = assessMedicationClass(classifiedMedications, 'statin')
  const ezetimibeAssessment = assessMedicationClass(classifiedMedications, 'ezetimibe')
  const pcsk9Assessment = assessMedicationClass(classifiedMedications, 'pcsk9-inhibitor')
  const bempedoicAcidAssessment = assessMedicationClass(classifiedMedications, 'bempedoic-acid')
  const fibrateAssessment = assessMedicationClass(classifiedMedications, 'fibrate')
  const prescriptionOmega3Assessment = assessMedicationClass(
    classifiedMedications,
    'prescription-omega-3',
  )
  const aceArbAssessment = assessMedicationClass(classifiedMedications, 'ace-inhibitor-or-arb')
  const ccbAssessment = assessMedicationClass(classifiedMedications, 'calcium-channel-blocker')
  const thiazideAssessment = assessMedicationClass(
    classifiedMedications,
    'thiazide-or-thiazide-like-diuretic',
  )
  const betaBlockerAssessment = assessMedicationClass(classifiedMedications, 'beta-blocker')
  const nonselectiveBetaBlockerAssessment = assessMedicationClass(
    classifiedMedications,
    'nonselective-beta-blocker',
  )
  const mraAssessment = assessMedicationClass(
    classifiedMedications,
    'mineralocorticoid-receptor-antagonist',
  )
  const lactuloseAssessment = assessMedicationClass(classifiedMedications, 'lactulose')
  const rifaximinAssessment = assessMedicationClass(classifiedMedications, 'rifaximin')
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
  const uniqueMedicationNames = (names: readonly string[]): string[] => {
    const seen = new Set<string>()
    return names
      .map((name) => name.trim().replace(/\s+/g, ' '))
      .filter((name) => {
        const key = name.normalize('NFKC').toLocaleLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }
  const medicationClassNames = (
    assessment: ReturnType<typeof assessMedicationClass>,
  ) => uniqueMedicationNames(
    assessment.medications
      .filter((item) => item.state === assessment.state)
      .map((item) => item.name),
  )
  const medicationNameSummary = (
    names: readonly string[],
    locale: 'zh-TW' | 'en',
  ): string => {
    const visibleNames = names.slice(0, 2)
    const separator = locale === 'en' ? ', ' : '、'
    const visible = visibleNames.join(separator)
    if (names.length <= visibleNames.length) return visible
    return locale === 'en'
      ? `${visible} and ${names.length - visibleNames.length} more`
      : `${visible} 等 ${names.length} 種`
  }
  const insulinTimeline = medicationClassTimeline(insulinAssessment)
  const sulfonylureaTimeline = medicationClassTimeline(sulfonylureaAssessment)
  const sglt2Timeline = medicationClassTimeline(sglt2Assessment)
  const arniTimeline = medicationClassTimeline(arniAssessment)
  const hfEvidenceBetaBlockerTimeline = medicationClassTimeline(
    hfEvidenceBetaBlockerAssessment,
  )
  const loopDiureticTimeline = medicationClassTimeline(loopDiureticAssessment)
  const statinTimeline = medicationClassTimeline(statinAssessment)
  const ezetimibeTimeline = medicationClassTimeline(ezetimibeAssessment)
  const pcsk9Timeline = medicationClassTimeline(pcsk9Assessment)
  const bempedoicAcidTimeline = medicationClassTimeline(bempedoicAcidAssessment)
  const fibrateTimeline = medicationClassTimeline(fibrateAssessment)
  const prescriptionOmega3Timeline = medicationClassTimeline(prescriptionOmega3Assessment)
  const aceArbTimeline = medicationClassTimeline(aceArbAssessment)
  const ccbTimeline = medicationClassTimeline(ccbAssessment)
  const thiazideTimeline = medicationClassTimeline(thiazideAssessment)
  const betaBlockerTimeline = medicationClassTimeline(betaBlockerAssessment)
  const nonselectiveBetaBlockerTimeline = medicationClassTimeline(
    nonselectiveBetaBlockerAssessment,
  )
  const mraTimeline = medicationClassTimeline(mraAssessment)
  const lactuloseTimeline = medicationClassTimeline(lactuloseAssessment)
  const rifaximinTimeline = medicationClassTimeline(rifaximinAssessment)
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
  const hypoglycemiaRiskNames = uniqueMedicationNames(
    hypoglycemiaAssessments
      .flatMap((assessment) => assessment.medications)
      .filter((item) => item.state === medicationClassState)
      .map((item) => item.name),
  )
  const hypoglycemiaRiskSummaryZh = medicationNameSummary(hypoglycemiaRiskNames, 'zh-TW')
  const hypoglycemiaRiskSummaryEn = medicationNameSummary(hypoglycemiaRiskNames, 'en')
  const hypoglycemiaMedicationSources = hypoglycemiaAssessments
    .filter((assessment) => assessment.state === medicationClassState)
    .flatMap(medicationClassSources)
  facts.hypoglycemiaRiskMedications = medicationClassState === 'confirmed-current'
    ? {
        zh: `已確認使用：${hypoglycemiaRiskSummaryZh}`,
        en: `Confirmed current use: ${hypoglycemiaRiskSummaryEn}`,
        sources: hypoglycemiaMedicationSources,
      }
    : medicationClassState === 'active-order-unconfirmed'
      ? {
          zh: `已有處方、尚未確認實際使用：${hypoglycemiaRiskSummaryZh}`,
          en: `Active order; actual use unconfirmed: ${hypoglycemiaRiskSummaryEn}`,
          sources: hypoglycemiaMedicationSources,
        }
      : medicationClassState === 'on-hold'
        ? {
            zh: `暫停中的胰島素／磺醯脲：${hypoglycemiaRiskSummaryZh}`,
            en: `Insulin/sulfonylurea on hold: ${hypoglycemiaRiskSummaryEn}`,
            sources: hypoglycemiaMedicationSources,
          }
        : medicationClassState === 'historical-record-current-status-unknown'
          ? {
              zh: `有歷史胰島素／磺醯脲處方，近期是否持續未知：${hypoglycemiaRiskSummaryZh}`,
              en: `Historical insulin/sulfonylurea record; current use is unknown: ${hypoglycemiaRiskSummaryEn}`,
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
    const names = medicationClassNames(assessment)
    const suffixZh = names.length > 0 ? `：${medicationNameSummary(names, 'zh-TW')}` : ''
    const suffixEn = names.length > 0 ? `: ${medicationNameSummary(names, 'en')}` : ''
    const timeline = medicationClassTimeline(assessment)
    const matchingRecordCount = assessment.medications
      .filter((item) => item.state === assessment.state)
      .length
    const timelineZh = assessment.state === 'historical-record-current-status-unknown'
      ? `（${matchingRecordCount} 筆處方 · 最近 ${timeline.lastPrescriptionDate ?? '日期不明'}）`
      : ''
    const timelineEn = assessment.state === 'historical-record-current-status-unknown'
      ? ` (${matchingRecordCount} prescription record${matchingRecordCount === 1 ? '' : 's'} · latest ${timeline.lastPrescriptionDate ?? 'unknown'})`
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
  facts.arniTherapy = classFact(
    arniAssessment,
    'ARNI',
    'ARNI',
  )
  facts.hfEvidenceBetaBlockerTherapy = classFact(
    hfEvidenceBetaBlockerAssessment,
    '具 HFrEF 實證的 β 阻斷劑',
    'evidence-based HFrEF beta-blocker',
  )
  facts.loopDiureticTherapy = classFact(
    loopDiureticAssessment,
    'loop 利尿劑',
    'loop diuretic',
  )
  facts.statinTherapy = classFact(
    statinAssessment,
    'statin',
    'statin',
  )
  facts.ezetimibeTherapy = classFact(
    ezetimibeAssessment,
    'ezetimibe',
    'ezetimibe',
  )
  facts.pcsk9Therapy = classFact(
    pcsk9Assessment,
    'PCSK9 抑制劑',
    'PCSK9 inhibitor',
  )
  facts.bempedoicAcidTherapy = classFact(
    bempedoicAcidAssessment,
    'bempedoic acid',
    'bempedoic acid',
  )
  facts.fibrateTherapy = classFact(
    fibrateAssessment,
    'fibrate',
    'fibrate',
  )
  facts.prescriptionOmega3Therapy = classFact(
    prescriptionOmega3Assessment,
    '處方 omega-3',
    'prescription omega-3',
  )
  facts.aceArbTherapy = classFact(
    aceArbAssessment,
    'ACEI／ARB',
    'ACE inhibitor/ARB',
  )
  facts.ccbTherapy = classFact(
    ccbAssessment,
    '鈣離子通道阻斷劑',
    'calcium-channel blocker',
  )
  facts.thiazideTherapy = classFact(
    thiazideAssessment,
    'thiazide／thiazide-like 利尿劑',
    'thiazide/thiazide-like diuretic',
  )
  facts.betaBlockerTherapy = classFact(
    betaBlockerAssessment,
    'β 阻斷劑',
    'beta-blocker',
  )
  facts.nonselectiveBetaBlockerTherapy = classFact(
    nonselectiveBetaBlockerAssessment,
    '非選擇性 β 阻斷劑',
    'nonselective beta-blocker',
  )
  facts.mraTherapy = classFact(
    mraAssessment,
    'spironolactone／eplerenone',
    'spironolactone/eplerenone',
  )
  facts.lactuloseTherapy = classFact(
    lactuloseAssessment,
    'lactulose',
    'lactulose',
  )
  facts.rifaximinTherapy = classFact(
    rifaximinAssessment,
    'rifaximin',
    'rifaximin',
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
  facts.ezetimibeAllergy = allergyFact('ezetimibe', 'ezetimibe', 'ezetimibe')
  facts.pcsk9Allergy = allergyFact('pcsk9-inhibitor', 'PCSK9 抑制劑', 'PCSK9 inhibitor')
  facts.bempedoicAcidAllergy = allergyFact(
    'bempedoic-acid',
    'bempedoic acid',
    'bempedoic acid',
  )
  facts.fibrateAllergy = allergyFact('fibrate', 'fibrate', 'fibrate')
  facts.prescriptionOmega3Allergy = allergyFact(
    'prescription-omega-3',
    '處方 omega-3',
    'prescription omega-3',
  )
  facts.aceArbAllergy = allergyFact('ace-inhibitor-or-arb', 'ACEI／ARB', 'ACE inhibitor/ARB')
  facts.ccbAllergy = allergyFact('calcium-channel-blocker', '鈣離子通道阻斷劑', 'calcium-channel blocker')
  facts.thiazideAllergy = allergyFact(
    'thiazide-or-thiazide-like-diuretic',
    'thiazide／thiazide-like 利尿劑',
    'thiazide/thiazide-like diuretic',
  )
  facts.betaBlockerAllergy = allergyFact('beta-blocker', 'β 阻斷劑', 'beta-blocker')
  facts.nonselectiveBetaBlockerAllergy = allergyFact(
    'nonselective-beta-blocker',
    '非選擇性 β 阻斷劑',
    'nonselective beta-blocker',
  )
  facts.mraAllergy = allergyFact(
    'mineralocorticoid-receptor-antagonist',
    'spironolactone／eplerenone',
    'spironolactone/eplerenone',
  )
  facts.lactuloseAllergy = allergyFact('lactulose', 'lactulose', 'lactulose')
  facts.rifaximinAllergy = allergyFact('rifaximin', 'rifaximin', 'rifaximin')
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
  const hypertensionEligibility = hypertensionDiagnosis
    ? {
        basis: hypertensionDiagnosis.basis,
        resourceType: hypertensionDiagnosis.resourceType,
        resourceId: hypertensionDiagnosis.resourceId,
        codingSystem: hypertensionDiagnosis.coding.system!,
        code: hypertensionDiagnosis.coding.code!,
      } as const
    : undefined
  const heartFailureEligibility = heartFailureDiagnosis
    ? {
        basis: heartFailureDiagnosis.basis,
        resourceType: heartFailureDiagnosis.resourceType,
        resourceId: heartFailureDiagnosis.resourceId,
        codingSystem: heartFailureDiagnosis.coding.system!,
        code: heartFailureDiagnosis.coding.code!,
      } as const
    : undefined
  const hyperlipidemiaEligibility = hyperlipidemiaDiagnosis
    ? {
        basis: hyperlipidemiaDiagnosis.basis,
        resourceType: hyperlipidemiaDiagnosis.resourceType,
        resourceId: hyperlipidemiaDiagnosis.resourceId,
        codingSystem: hyperlipidemiaDiagnosis.coding.system!,
        code: hyperlipidemiaDiagnosis.coding.code!,
      } as const
    : facts.LDL?.numericValue !== undefined && facts.LDL.numericValue >= 190
      ? {
          basis: 'ldl_severe_range',
          resourceType: 'Observation',
          resourceId: facts.LDL.sources?.[0]?.resourceId,
          codingSystem: LOINC_SYSTEM,
          code: facts.LDL.sources?.[0]?.coding?.find((coding) => (
            coding.system === LOINC_SYSTEM
            && typeof coding.code === 'string'
            && LDL_LOINC.has(coding.code)
          ))?.code ?? '2089-1',
        } as const
      : facts.triglycerides?.numericValue !== undefined
          && facts.triglycerides.numericValue >= 500
        ? {
            basis: 'triglyceride_severe_range',
            resourceType: 'Observation',
            resourceId: facts.triglycerides.sources?.[0]?.resourceId,
            codingSystem: LOINC_SYSTEM,
            code: TRIGLYCERIDE_LOINC,
          } as const
        : undefined
  const cirrhosisEligibility = cirrhosisDiagnosis
    ? {
        basis: cirrhosisDiagnosis.basis,
        resourceType: cirrhosisDiagnosis.resourceType,
        resourceId: cirrhosisDiagnosis.resourceId,
        codingSystem: cirrhosisDiagnosis.coding.system!,
        code: cirrhosisDiagnosis.coding.code!,
      } as const
    : undefined

  const eligibleDiseasePackIds = [
    ...(dmEligibility ? ['dm-poc'] : []),
    ...(ckdEligibility ? ['ckd-poc'] : []),
    ...(hypertensionEligibility ? ['hypertension-poc'] : []),
    ...(heartFailureEligibility ? ['heart-failure-poc'] : []),
    ...(hyperlipidemiaEligibility ? ['hyperlipidemia-poc'] : []),
    ...(cirrhosisEligibility ? ['cirrhosis-poc'] : []),
  ]
  const diseasePackEligibility = {
    ...(dmEligibility ? { 'dm-poc': dmEligibility } : {}),
    ...(ckdEligibility ? { 'ckd-poc': ckdEligibility } : {}),
    ...(hypertensionEligibility ? { 'hypertension-poc': hypertensionEligibility } : {}),
    ...(heartFailureEligibility
      ? { 'heart-failure-poc': heartFailureEligibility }
      : {}),
    ...(hyperlipidemiaEligibility
      ? { 'hyperlipidemia-poc': hyperlipidemiaEligibility }
      : {}),
    ...(cirrhosisEligibility
      ? { 'cirrhosis-poc': cirrhosisEligibility }
      : {}),
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
    HDL: assessFactFreshness({
      factKey: 'HDL',
      date: facts.HDL?.date,
      intervalDays: 365,
      now,
    }),
    triglycerides: assessFactFreshness({
      factKey: 'triglycerides',
      date: facts.triglycerides?.date,
      intervalDays: 365,
      now,
    }),
    nonHDL: assessFactFreshness({
      factKey: 'nonHDL',
      date: facts.nonHDL?.date,
      intervalDays: 365,
      now,
    }),
    apolipoproteinB: assessFactFreshness({
      factKey: 'apolipoproteinB',
      date: facts.apolipoproteinB?.date,
      intervalDays: 365,
      now,
    }),
    plateletCount: assessFactFreshness({
      factKey: 'plateletCount',
      date: facts.plateletCount?.date,
      intervalDays: 180,
      now,
    }),
    totalBilirubin: assessFactFreshness({
      factKey: 'totalBilirubin',
      date: facts.totalBilirubin?.date,
      intervalDays: 90,
      now,
    }),
    INR: assessFactFreshness({
      factKey: 'INR',
      date: facts.INR?.date,
      intervalDays: 90,
      now,
    }),
    albumin: assessFactFreshness({
      factKey: 'albumin',
      date: facts.albumin?.date,
      intervalDays: 90,
      now,
    }),
    sodium: assessFactFreshness({
      factKey: 'sodium',
      date: facts.sodium?.date,
      intervalDays: 90,
      now,
    }),
    serumCreatinine: assessFactFreshness({
      factKey: 'serumCreatinine',
      date: facts.serumCreatinine?.date,
      intervalDays: 90,
      now,
    }),
    AFP: assessFactFreshness({
      factKey: 'AFP',
      date: facts.AFP?.date,
      intervalDays: 183,
      now,
    }),
    liverUltrasound: assessFactFreshness({
      factKey: 'liverUltrasound',
      date: facts.liverUltrasound?.date,
      intervalDays: 183,
      now,
    }),
    upperEndoscopy: assessFactFreshness({
      factKey: 'upperEndoscopy',
      date: facts.upperEndoscopy?.date,
      intervalDays: 730,
      now,
    }),
    liverStiffness: assessFactFreshness({
      factKey: 'liverStiffness',
      date: facts.liverStiffness?.date,
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
    evaluatedAt: now.toISOString(),
    ...(input.patient.gender ? {
      demographics: { sex: input.patient.gender },
    } : {}),
    ...(eligibleDiseasePackIds.length > 0 ? {
      eligibleDiseasePackIds,
      diseasePackEligibility,
    } : {}),
    facts,
    akiAssessment,
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
      arni: {
        state: arniAssessment.state,
        medicationNames: medicationClassNames(arniAssessment),
        factKey: 'arniTherapy',
        ...arniTimeline,
        allergyState: allergyAssessments.arni.state,
        allergyNames: allergyAssessments.arni.allergyNames,
      },
      'hf-evidence-based-beta-blocker': {
        state: hfEvidenceBetaBlockerAssessment.state,
        medicationNames: medicationClassNames(hfEvidenceBetaBlockerAssessment),
        factKey: 'hfEvidenceBetaBlockerTherapy',
        ...hfEvidenceBetaBlockerTimeline,
        allergyState: allergyAssessments['hf-evidence-based-beta-blocker'].state,
        allergyNames: allergyAssessments['hf-evidence-based-beta-blocker'].allergyNames,
      },
      'loop-diuretic': {
        state: loopDiureticAssessment.state,
        medicationNames: medicationClassNames(loopDiureticAssessment),
        factKey: 'loopDiureticTherapy',
        ...loopDiureticTimeline,
        allergyState: allergyAssessments['loop-diuretic'].state,
        allergyNames: allergyAssessments['loop-diuretic'].allergyNames,
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
      ezetimibe: {
        state: ezetimibeAssessment.state,
        medicationNames: medicationClassNames(ezetimibeAssessment),
        factKey: 'ezetimibeTherapy',
        ...ezetimibeTimeline,
        allergyState: allergyAssessments.ezetimibe.state,
        allergyNames: allergyAssessments.ezetimibe.allergyNames,
        allergyFactKey: 'ezetimibeAllergy',
      },
      'pcsk9-inhibitor': {
        state: pcsk9Assessment.state,
        medicationNames: medicationClassNames(pcsk9Assessment),
        factKey: 'pcsk9Therapy',
        ...pcsk9Timeline,
        allergyState: allergyAssessments['pcsk9-inhibitor'].state,
        allergyNames: allergyAssessments['pcsk9-inhibitor'].allergyNames,
        allergyFactKey: 'pcsk9Allergy',
      },
      'bempedoic-acid': {
        state: bempedoicAcidAssessment.state,
        medicationNames: medicationClassNames(bempedoicAcidAssessment),
        factKey: 'bempedoicAcidTherapy',
        ...bempedoicAcidTimeline,
        allergyState: allergyAssessments['bempedoic-acid'].state,
        allergyNames: allergyAssessments['bempedoic-acid'].allergyNames,
        allergyFactKey: 'bempedoicAcidAllergy',
      },
      fibrate: {
        state: fibrateAssessment.state,
        medicationNames: medicationClassNames(fibrateAssessment),
        factKey: 'fibrateTherapy',
        ...fibrateTimeline,
        allergyState: allergyAssessments.fibrate.state,
        allergyNames: allergyAssessments.fibrate.allergyNames,
        allergyFactKey: 'fibrateAllergy',
      },
      'prescription-omega-3': {
        state: prescriptionOmega3Assessment.state,
        medicationNames: medicationClassNames(prescriptionOmega3Assessment),
        factKey: 'prescriptionOmega3Therapy',
        ...prescriptionOmega3Timeline,
        allergyState: allergyAssessments['prescription-omega-3'].state,
        allergyNames: allergyAssessments['prescription-omega-3'].allergyNames,
        allergyFactKey: 'prescriptionOmega3Allergy',
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
      'calcium-channel-blocker': {
        state: ccbAssessment.state,
        medicationNames: medicationClassNames(ccbAssessment),
        factKey: 'ccbTherapy',
        ...ccbTimeline,
        allergyState: allergyAssessments['calcium-channel-blocker'].state,
        allergyNames: allergyAssessments['calcium-channel-blocker'].allergyNames,
        allergyFactKey: 'ccbAllergy',
      },
      'thiazide-or-thiazide-like-diuretic': {
        state: thiazideAssessment.state,
        medicationNames: medicationClassNames(thiazideAssessment),
        factKey: 'thiazideTherapy',
        ...thiazideTimeline,
        allergyState: allergyAssessments['thiazide-or-thiazide-like-diuretic'].state,
        allergyNames: allergyAssessments['thiazide-or-thiazide-like-diuretic'].allergyNames,
        allergyFactKey: 'thiazideAllergy',
      },
      'beta-blocker': {
        state: betaBlockerAssessment.state,
        medicationNames: medicationClassNames(betaBlockerAssessment),
        factKey: 'betaBlockerTherapy',
        ...betaBlockerTimeline,
        allergyState: allergyAssessments['beta-blocker'].state,
        allergyNames: allergyAssessments['beta-blocker'].allergyNames,
        allergyFactKey: 'betaBlockerAllergy',
      },
      'nonselective-beta-blocker': {
        state: nonselectiveBetaBlockerAssessment.state,
        medicationNames: medicationClassNames(nonselectiveBetaBlockerAssessment),
        factKey: 'nonselectiveBetaBlockerTherapy',
        ...nonselectiveBetaBlockerTimeline,
        allergyState: allergyAssessments['nonselective-beta-blocker'].state,
        allergyNames: allergyAssessments['nonselective-beta-blocker'].allergyNames,
        allergyFactKey: 'nonselectiveBetaBlockerAllergy',
      },
      'mineralocorticoid-receptor-antagonist': {
        state: mraAssessment.state,
        medicationNames: medicationClassNames(mraAssessment),
        factKey: 'mraTherapy',
        ...mraTimeline,
        allergyState: allergyAssessments['mineralocorticoid-receptor-antagonist'].state,
        allergyNames: allergyAssessments['mineralocorticoid-receptor-antagonist'].allergyNames,
        allergyFactKey: 'mraAllergy',
      },
      lactulose: {
        state: lactuloseAssessment.state,
        medicationNames: medicationClassNames(lactuloseAssessment),
        factKey: 'lactuloseTherapy',
        ...lactuloseTimeline,
        allergyState: allergyAssessments.lactulose.state,
        allergyNames: allergyAssessments.lactulose.allergyNames,
        allergyFactKey: 'lactuloseAllergy',
      },
      rifaximin: {
        state: rifaximinAssessment.state,
        medicationNames: medicationClassNames(rifaximinAssessment),
        factKey: 'rifaximinTherapy',
        ...rifaximinTimeline,
        allergyState: allergyAssessments.rifaximin.state,
        allergyNames: allergyAssessments.rifaximin.allergyNames,
        allergyFactKey: 'rifaximinAllergy',
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
