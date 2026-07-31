import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import type {
  CdssFactSource,
  CdssMedicationClassId,
  CdssMedicationClassState,
} from '../types'

const CURRENT_MEDICATION_STATUSES = new Set(['active', 'on-hold'])
const HISTORICAL_MEDICATION_STATUSES = new Set(['completed', 'stopped'])
const ANTIDIABETIC_CATEGORY = /antidiabetic|anti-diabetic|抗糖尿病|降血糖/i
const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm'

const CLASS_PATTERNS: Readonly<Record<CdssMedicationClassId, RegExp>> = {
  insulin: /\b(?:insulin|lantus|toujeo|tresiba|levemir|humalog|humulin|novolin|novorapid|novomix|apidra|fiasp|basaglar|ryzodeg|soliqua|xultophy)\b|胰島素/i,
  sulfonylurea: /\b(?:sulfonylurea|glimepiride|gliclazide|glipizide|glyburide|glibenclamide|gliquidone|tolbutamide|chlorpropamide|amaryl|diamicron|daonil|euglucon|minidiab)\b|磺醯脲|磺醯尿素/i,
  'sglt2-inhibitor': /\b(?:sglt2|dapagliflozin|empagliflozin|canagliflozin|ertugliflozin|forxiga|jardiance|invokana|steglatro)\b|福適佳|恩排糖|可拿糖|穩適妥/i,
  arni: /\b(?:arni|sacubitril[\s/-]*valsartan|entresto)\b|沙庫巴曲[\s/／-]*纈沙坦|諾欣妥/i,
  'hf-evidence-based-beta-blocker': /\b(?:bisoprolol|carvedilol|metoprolol succinate|metoprolol (?:cr|xl)|concor|coreg)\b|康肯|達利全/i,
  'loop-diuretic': /\b(?:loop diuretic|furosemide|bumetanide|torsemide|lasix|burinex|demadex)\b|袢利尿劑|環利尿劑|呋塞米|速尿/i,
  statin: /\b(?:statin|atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|fluvastatin|pitavastatin|lipitor|crestor|zocor|lescol|livalo)\b/i,
  ezetimibe: /\b(?:ezetimibe|ezetrol|zetia)\b|依折麥布|益適純/i,
  'pcsk9-inhibitor': /\b(?:pcsk9|evolocumab|alirocumab|repatha|praluent)\b|瑞百安|波立達/i,
  'bempedoic-acid': /\b(?:bempedoic acid|nexletol|nilemdo)\b|貝派地酸/i,
  fibrate: /\b(?:fibrate|fenofibrate|gemfibrozil|bezafibrate|ciprofibrate|lipanthyl|lopid)\b|貝特類|非諾貝特|吉非羅齊/i,
  'prescription-omega-3': /\b(?:icosapent ethyl|omega-3-acid ethyl esters|vascepa|omacor|lovaza)\b|二十碳五烯酸乙酯|處方魚油/i,
  'ace-inhibitor-or-arb': /\b(?:ace inhibitor|angiotensin(?: ii)? receptor blocker|enalapril|lisinopril|ramipril|perindopril|captopril|benazepril|fosinopril|quinapril|trandolapril|losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan|azilsartan|cozaar|diovan|aprovel|atacand|micardis|olmetec)\b|血管張力素轉換酶抑制劑|血管張力素受體阻斷劑/i,
  'calcium-channel-blocker': /\b(?:calcium channel blocker|amlodipine|felodipine|nifedipine|nicardipine|lercanidipine|diltiazem|verapamil|norvasc|adalat|plendil)\b|鈣離子通道阻斷劑|鈣通道阻斷劑/i,
  'thiazide-or-thiazide-like-diuretic': /\b(?:thiazide|hydrochlorothiazide|chlorthalidone|indapamide|metolazone)\b|噻嗪|噻唑類利尿劑/i,
  'beta-blocker': /\b(?:beta[- ]blocker|bisoprolol|metoprolol|atenolol|carvedilol|nebivolol|propranolol|labetalol|acebutolol|betaxolol|esmolol|inderal|concor|tenormin|coreg)\b|乙型阻斷劑|β阻斷劑|貝他阻斷劑/i,
  'nonselective-beta-blocker': /\b(?:non[- ]?selective beta[- ]?blocker|carvedilol|propranolol|nadolol|coreg|inderal|corgard)\b|非選擇性(?:乙型|β|貝他)阻斷劑|卡維地洛|普萘洛爾|納多洛爾/i,
  'mineralocorticoid-receptor-antagonist': /\b(?:mineralocorticoid receptor antagonist|spironolactone|eplerenone|aldactone|inspra)\b|礦物皮質素受體拮抗劑|醛固酮拮抗劑|螺內酯/i,
  lactulose: /\b(?:lactulose|enulose|generlac|constulose)\b|乳果糖/i,
  rifaximin: /\b(?:rifaximin|xifaxan)\b|利福昔明|利福西明/i,
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
  arni: new Set(['1656340']),
  'hf-evidence-based-beta-blocker': new Set(['19484', '20352']),
  'loop-diuretic': new Set(['4603', '1808', '38413']),
  statin: new Set(['6472', '36567', '41127', '42463', '83367', '301542', '861634']),
  ezetimibe: new Set(['341248']),
  'pcsk9-inhibitor': new Set(['1659151', '1665684']),
  'bempedoic-acid': new Set(['2281856']),
  fibrate: new Set(['8703', '4719', '1520']),
  'prescription-omega-3': new Set(['1304987']),
  'ace-inhibitor-or-arb': new Set([
    '18867', '29046', '321064', '35296', '3827', '52175', '69749', '73494', '83818', '214354',
  ]),
  'calcium-channel-blocker': new Set([
    '17767', '4603', '7417', '7396', '135447',
  ]),
  'thiazide-or-thiazide-like-diuretic': new Set([
    '5487', '2409', '5764', '6916',
  ]),
  'beta-blocker': new Set([
    '19484', '6918', '1202', '20352', '6185', '7226', '21212',
  ]),
  'nonselective-beta-blocker': new Set(['20352', '8787', '7226']),
  'mineralocorticoid-receptor-antagonist': new Set(['9997', '298869']),
  lactulose: new Set(['6218']),
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
    case 'arni':
      return code === 'C09DX04'
    case 'hf-evidence-based-beta-blocker':
      // Ingredient-level ATC C07AB02 cannot distinguish immediate-release
      // metoprolol tartrate from the evidence-based succinate CR/XL product.
      // Metoprolol is therefore accepted only through explicit formulation text.
      return code === 'C07AB07' || code === 'C07AG02'
    case 'loop-diuretic':
      return code.startsWith('C03C')
    case 'statin':
      return code.startsWith('C10AA') || code.startsWith('C10BA') || code.startsWith('C10BX')
    case 'ezetimibe':
      return code === 'C10AX09' || code.startsWith('C10BA')
    case 'pcsk9-inhibitor':
      return code === 'C10AX13' || code === 'C10AX14'
    case 'bempedoic-acid':
      return code === 'C10AX15'
    case 'fibrate':
      return code.startsWith('C10AB')
    case 'prescription-omega-3':
      return code === 'C10AX06'
    case 'ace-inhibitor-or-arb':
      return /^C09[ABCD]/.test(code)
    case 'calcium-channel-blocker':
      return code.startsWith('C08')
    case 'thiazide-or-thiazide-like-diuretic':
      return /^(?:C03A|C03B|C03E)/.test(code)
    case 'beta-blocker':
      return code.startsWith('C07')
    case 'nonselective-beta-blocker':
      return code.startsWith('C07AA') || code === 'C07AG02'
    case 'mineralocorticoid-receptor-antagonist':
      return code === 'C03DA01' || code === 'C03DA04'
    case 'lactulose':
      return code === 'A06AD11'
    case 'rifaximin':
      return code === 'A07AA11'
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
  if (HISTORICAL_MEDICATION_STATUSES.has((medication.status ?? '').toLowerCase())) {
    return 'historical-record-current-status-unknown'
  }
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
  const governedRecords = medications.filter((medication) => (
    Boolean(medication.id)
    && (
      CURRENT_MEDICATION_STATUSES.has((medication.status ?? '').toLowerCase())
      || HISTORICAL_MEDICATION_STATUSES.has((medication.status ?? '').toLowerCase())
    )
  ))
  const classified: ClassifiedMedication[] = []
  let unclassifiedAntidiabeticCount = 0

  for (const medication of governedRecords) {
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
      && CURRENT_MEDICATION_STATUSES.has((medication.status ?? '').toLowerCase())
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
          : medications.some((item) => item.state === 'on-hold')
            ? 'on-hold'
            : 'historical-record-current-status-unknown'
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
