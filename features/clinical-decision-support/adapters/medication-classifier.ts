import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import type {
  CdssFactSource,
  CdssMedicationClassId,
  CdssMedicationClassState,
} from '../types'

const CURRENT_MEDICATION_STATUSES = new Set(['active', 'on-hold'])
const ANTIDIABETIC_CATEGORY = /antidiabetic|anti-diabetic|抗糖尿病|降血糖/i
const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm'

const CLASS_PATTERNS: Readonly<Record<CdssMedicationClassId, RegExp>> = {
  insulin: /\b(?:insulin|lantus|toujeo|tresiba|levemir|humalog|humulin|novolin|novorapid|novomix|apidra|fiasp|basaglar|ryzodeg|soliqua|xultophy)\b|胰島素/i,
  sulfonylurea: /\b(?:sulfonylurea|glimepiride|gliclazide|glipizide|glyburide|glibenclamide|gliquidone|tolbutamide|chlorpropamide|amaryl|diamicron|daonil|euglucon|minidiab)\b|磺醯脲|磺醯尿素/i,
  'sglt2-inhibitor': /\b(?:sglt2|dapagliflozin|empagliflozin|canagliflozin|ertugliflozin|forxiga|jardiance|invokana|steglatro)\b|福適佳|恩排糖|可拿糖|穩適妥/i,
  statin: /\b(?:statin|atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|fluvastatin|pitavastatin|lipitor|crestor|zocor|lescol|livalo)\b/i,
  'ace-inhibitor-or-arb': /\b(?:ace inhibitor|angiotensin(?: ii)? receptor blocker|enalapril|lisinopril|ramipril|perindopril|captopril|benazepril|fosinopril|quinapril|trandolapril|losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan|azilsartan|cozaar|diovan|aprovel|atacand|micardis|olmetec)\b|血管張力素轉換酶抑制劑|血管張力素受體阻斷劑/i,
  finerenone: /\b(?:finerenone|kerendia)\b|可申達/i,
}
const RECOGNIZED_OTHER_ANTIDIABETIC = /\b(?:metformin|semaglutide|liraglutide|dulaglutide|exenatide|lixisenatide|tirzepatide|ozempic|rybelsus|victoza|trulicity|bydureon|mounjaro|sitagliptin|linagliptin|saxagliptin|alogliptin|vildagliptin|jan(?:u)?via|trajenta|onglyza|galvus|pioglitazone|rosiglitazone|acarbose|miglitol|voglibose|repaglinide|nateglinide)\b|二甲雙胍|胰妥讚|瑞倍適|胰妥善|易週糖|猛健樂/i

type CodingLike = {
  system?: string
  code?: string
  display?: string
}

const RXNORM_INGREDIENTS: Readonly<Partial<Record<CdssMedicationClassId, ReadonlySet<string>>>> = {
  insulin: new Set(['253182', '274783', '86009']),
  sulfonylurea: new Set(['25789', '4815', '4821', '6476']),
  'sglt2-inhibitor': new Set(['1373458', '1488564', '1545653', '1992672']),
  statin: new Set(['6472', '36567', '41127', '42463', '83367', '301542', '861634']),
  'ace-inhibitor-or-arb': new Set([
    '18867', '29046', '321064', '35296', '3827', '52175', '69749', '73494', '83818', '214354',
  ]),
  finerenone: new Set(['2562821']),
}

function normalizedCode(value?: string): string {
  return (value ?? '').trim().toUpperCase().replaceAll('.', '')
}

function isAtcSystem(system?: string): boolean {
  const normalized = (system ?? '').toLowerCase()
  return normalized.includes('whocc.no/atc') || normalized.endsWith('/atc')
}

function matchesStandardCode(
  classId: CdssMedicationClassId,
  coding: CodingLike,
): boolean {
  const code = normalizedCode(coding.code)
  if (!code) return false

  if (coding.system === RXNORM_SYSTEM) {
    return RXNORM_INGREDIENTS[classId]?.has(code) === true
  }
  if (!isAtcSystem(coding.system)) return false

  switch (classId) {
    case 'insulin':
      return code.startsWith('A10A')
    case 'sulfonylurea':
      return code.startsWith('A10BB')
    case 'sglt2-inhibitor':
      return code.startsWith('A10BK')
    case 'statin':
      return code.startsWith('C10AA') || code.startsWith('C10BA') || code.startsWith('C10BX')
    case 'ace-inhibitor-or-arb':
      return /^C09[ABCD]/.test(code)
    case 'finerenone':
      return code === 'C03DA05'
  }
}

export function medicationClassesFromEvidence(input: {
  texts?: readonly (string | undefined)[]
  codings?: readonly CodingLike[]
}): CdssMedicationClassId[] {
  const searchable = [
    ...(input.texts ?? []),
    ...(input.codings ?? []).flatMap((coding) => [coding.code, coding.display]),
  ].filter(Boolean).join(' ')

  return (Object.entries(CLASS_PATTERNS) as Array<[CdssMedicationClassId, RegExp]>)
    .filter(([classId, pattern]) => (
      pattern.test(searchable)
      || input.codings?.some((coding) => matchesStandardCode(classId, coding)) === true
    ))
    .map(([classId]) => classId)
}

export interface ClassifiedMedication {
  classId: CdssMedicationClassId
  name: string
  medication: MedicationEntity
  state: Exclude<CdssMedicationClassState, 'not-found' | 'uncertain'>
}

export interface MedicationClassAssessment {
  state: CdssMedicationClassState
  medications: readonly ClassifiedMedication[]
  unclassifiedAntidiabeticCount: number
}

function searchableMedicationText(medication: MedicationEntity): string {
  return [
    medication.medicationCodeableConcept?.text,
    medication.medicationReference?.display,
    ...(medication.medicationCodeableConcept?.coding ?? []).flatMap((coding) => [
      coding.code,
      coding.display,
    ]),
    ...(medication.category ?? []).flatMap((category) => [
      category.text,
      ...(category.coding ?? []).flatMap((coding) => [coding.code, coding.display]),
    ]),
  ].filter(Boolean).join(' ')
}

function medicationRecordState(
  medication: MedicationEntity,
): Exclude<CdssMedicationClassState, 'not-found' | 'uncertain'> {
  if ((medication.status ?? '').toLowerCase() === 'on-hold') return 'on-hold'
  return medication._sourceResourceType === 'MedicationStatement'
    ? 'confirmed-current'
    : 'active-order-unconfirmed'
}

export function medicationDisplayName(medication: MedicationEntity): string {
  return medication.medicationCodeableConcept?.text
    ?? medication.medicationCodeableConcept?.coding?.find((coding) => coding.display)?.display
    ?? medication.medicationReference?.display
    ?? '未命名藥物'
}

export function currentMedicationRecords(
  medications: readonly MedicationEntity[],
): MedicationEntity[] {
  return medications.filter((medication) => (
    Boolean(medication.id)
    && CURRENT_MEDICATION_STATUSES.has((medication.status ?? '').toLowerCase())
  ))
}

export function classifyCurrentMedications(
  medications: readonly MedicationEntity[],
): {
  classified: readonly ClassifiedMedication[]
  unclassifiedAntidiabeticCount: number
} {
  const current = currentMedicationRecords(medications)
  const classified: ClassifiedMedication[] = []
  let unclassifiedAntidiabeticCount = 0

  for (const medication of current) {
    const searchable = searchableMedicationText(medication)
    const matchedClasses = medicationClassesFromEvidence({
      texts: [searchable],
      codings: medication.medicationCodeableConcept?.coding,
    })

    for (const classId of matchedClasses) {
      classified.push({
        classId,
        name: medicationDisplayName(medication),
        medication,
        state: medicationRecordState(medication),
      })
    }

    if (
      matchedClasses.length === 0
      && ANTIDIABETIC_CATEGORY.test(searchable)
      && !RECOGNIZED_OTHER_ANTIDIABETIC.test(searchable)
    ) {
      unclassifiedAntidiabeticCount += 1
    }
  }

  return { classified, unclassifiedAntidiabeticCount }
}

export function assessMedicationClass(
  classified: ReturnType<typeof classifyCurrentMedications>,
  classId: CdssMedicationClassId,
): MedicationClassAssessment {
  const medications = classified.classified.filter((item) => item.classId === classId)
  const ingredientAmbiguityAffectsClass = (
    classId === 'insulin' || classId === 'sulfonylurea'
  )
  return {
    state: medications.length > 0
      ? medications.some((item) => item.state === 'confirmed-current')
        ? 'confirmed-current'
        : medications.some((item) => item.state === 'active-order-unconfirmed')
          ? 'active-order-unconfirmed'
          : 'on-hold'
      : ingredientAmbiguityAffectsClass && classified.unclassifiedAntidiabeticCount > 0
        ? 'uncertain'
        : 'not-found',
    medications,
    unclassifiedAntidiabeticCount: classified.unclassifiedAntidiabeticCount,
  }
}

export function medicationClassSources(
  assessment: MedicationClassAssessment,
): CdssFactSource[] {
  return assessment.medications
    .filter(({ state }) => state === assessment.state)
    .map(({ medication }) => ({
    resourceType: medication._sourceResourceType ?? 'MedicationRequest',
    resourceId: medication.id,
    date: medication.authoredOn?.slice(0, 10),
    status: medication.status,
    coding: medication.medicationCodeableConcept?.coding,
    facility: medication._sourceResourceType === 'MedicationStatement'
      ? medication.informationSource?.display
      : medication.requester?.display,
    sourceSystem: medication.sourceSystem,
    }))
}
