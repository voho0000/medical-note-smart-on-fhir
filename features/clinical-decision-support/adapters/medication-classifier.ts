import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import type {
  CdssFactSource,
  CdssMedicationClassId,
  CdssMedicationClassState,
} from '../types'

/**
 * 記錄來源是健保雲端病歷／健康存摺：跨院所的「處方」紀錄，只有「開過這張處方」
 * 與「沒有這張處方」兩種狀態。Bridge 由 `authoredOn + expectedSupplyDuration`
 * 推算 `status`：供應期內寫 `active`、供應期過了寫 `completed`；不會出現
 * `on-hold` 或 `stopped`，也沒有 MedicationStatement 可以再確認一次。
 *
 * 因此 `completed` 只代表「這批藥發完了」，不代表停藥：慢性處方箋晚幾天回診、
 * 換一家院所回補處方，都會讓供應期短暫斷開。供應結束後 30 天內的處方仍視為
 * 使用中（晚領藥不是停藥），超過 30 天才視為沒有在用。
 *
 * 反過來說，跨院所資料裡「沒有紀錄」本身就是證據：不必再對醫師說「資料中未見
 * 不等於沒有使用」。
 */
const PRESCRIPTION_GRACE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Statuses that void a prescription record, mirroring `EXCLUDED_MEDICATION_STATUS`
 * in the profile adapter. Everything else is admitted — including `unknown` and
 * a missing status — and whether the patient is taking it is then decided by the
 * supply window alone.
 *
 * This is a denylist rather than an `active|completed|on-hold|stopped` allowlist
 * because `unknown` is a legal FHIR status and the NHI cloud record carries no
 * lifecycle of its own: the bridge writes `unknown` on every MedicationRequest
 * it emits, so the allowlist dropped every real prescription and left the packs
 * scanning an empty medication list.
 */
const EXCLUDED_MEDICATION_STATUSES = new Set(['cancelled', 'entered-in-error'])
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
  // Calcium carbonate has no phosphate-binder ATC of its own (it also codes as
  // an antacid and as a calcium supplement), so the class relies on the name and
  // the card states the binder reading conditionally rather than asserting it.
  'calcium-based-phosphate-binder': /\b(?:calcium acetate|calcium carbonate|phoslo|phoslyra|renacet|calcichew|osvaren)\b|醋酸鈣|碳酸鈣/i,
  'non-calcium-phosphate-binder': /\b(?:sevelamer|lanthanum carbonate|sucroferric oxyhydroxide|colestilan|ferric citrate|renagel|renvela|fosrenol|velphoro|nephoxil)\b|思維拉莫|碳酸鑭|拿百磷/i,
  // Ferric citrate (Nephoxil) is deliberately absent: it is dispensed as a
  // phosphate binder, and counting it as iron therapy would make an untreated
  // iron deficiency read as already treated.
  'iron-therapy': /\b(?:ferrous (?:sulfate|sulphate|fumarate|gluconate|succinate|ascorbate)|iron (?:sucrose|dextran|isomaltoside|polysaccharide|protein succinylate)|ferric (?:carboxymaltose|derisomaltose|gluconate|pyrophosphate)|sodium ferrous citrate|ferumoxytol|saccharated ferric oxide|venofer|ferinject|injectafer|monofer|feraheme|ferrlecit|infed|ferromia|legofer)\b|硫酸亞鐵|葡萄糖酸亞鐵|富馬酸亞鐵|蔗糖鐵|羧基麥芽糖鐵|鐵劑|口服鐵|靜脈鐵/i,
  'erythropoiesis-stimulating-agent': /\b(?:erythropoietin|epoetin(?:\s*(?:alfa|alpha|beta|theta|zeta))?|darbepoetin|methoxy polyethylene glycol[-\s]*epoetin beta|eprex|recormon|neorecormon|aranesp|mircera|epogen|procrit|retacrit|binocrit|silapo)\b|紅血球生成素|促紅血球生成素/i,
  'hif-phi': /\b(?:roxadustat|daprodustat|vadadustat|enarodustat|molidustat|desidustat|evrenzo|vafseo|jesduvroq|duvroq)\b|低氧誘導因子|缺氧誘導因子/i,
  aspirin: /\b(?:aspirin|acetylsalicylic acid|lysine aspirin|bokey|aspirin protect)\b|阿斯匹林|乙醯水楊酸|伯基/i,
  'p2y12-inhibitor': /\b(?:p2y12|clopidogrel|ticlopidine|prasugrel|ticagrelor|cangrelor|plavix|brilinta|efient|licodin)\b|氯吡格雷|得保栓|百無凝|抑凝安/i,
  'direct-oral-anticoagulant': /\b(?:doac|noac|direct oral anticoagulant|rivaroxaban|apixaban|edoxaban|dabigatran|xarelto|eliquis|lixiana|pradaxa)\b|直接口服抗凝血劑|新型口服抗凝血劑|拜瑞妥|艾必克凝|里先安|普栓達/i,
  'vitamin-k-antagonist': /\b(?:vitamin k antagonist|warfarin|acenocoumarol|phenprocoumon|coumadin|orfarin|mafarin)\b|維生素\s?K\s?拮抗劑|口服抗凝血素|可化凝|脈化寧|歐服寧/i,
  'low-molecular-weight-heparin': /\b(?:low[- ]molecular[- ]weight heparin|lmwh|enoxaparin|dalteparin|nadroparin|tinzaparin|parnaparin|reviparin|bemiparin|clexane|fragmin|fraxiparine|innohep)\b|低分子量肝素|克立生|弗列明|速避凝/i,
  ivabradine: /\b(?:ivabradine|procoralan|coralan|ivaheart)\b|伊伐布雷定|康立來|立舒心/i,
  vericiguat: /\b(?:vericiguat|verquvo)\b|維利西呱/i,
  // A conjunction, not a product: see HYDRALAZINE_COMPONENT / NITRATE_COMPONENT
  // below. This pattern only catches a single record that names both
  // ingredients itself (a fixed-dose combination such as BiDil); the ordinary
  // two-tablet regimen is assembled from separate records.
  'hydralazine-isdn': /\b(?:bidil)\b|hydralazine[\s\S]{0,80}isosorbide|isosorbide[\s\S]{0,80}hydralazine/i,
  digoxin: /\b(?:digoxin|digitoxin|metildigoxin|methyldigoxin|lanoxin|lanitop|digosin|cardiacin)\b|毛地黃|地高辛|隆我心|朗寧/i,
}

/**
 * Hydralazine／ISDN is prescribed in Taiwan as two separate tablets, so the
 * class is only true when both halves are being taken at once. These component
 * matchers are private to that conjunction and are not classes of their own:
 * hydralazine alone is an antihypertensive and a nitrate alone is anti-anginal,
 * and reading either as H-ISDN would tell the heart-failure pack the patient is
 * already on a therapy they have never been given.
 */
const HYDRALAZINE_COMPONENT = /\b(?:hydralazine|dihydralazine|apresoline)\b|亥爪拉[任壬]|辛爪拉任|拉貝克/i
const HYDRALAZINE_ATC = new Set(['C02DB01', 'C02DB02'])
// Isosorbide only. Glyceryl trinitrate (C01DA02) is the as-needed anginal
// rescue, not the maintenance nitrate the H-ISDN evidence is built on.
const NITRATE_COMPONENT = /\b(?:isosorbide (?:di|mono)nitrate|isdn|ismn)\b|硝酸異山梨(?:酯|醇)|伊索倍雷|伊速必得/i
const NITRATE_ATC = new Set(['C01DA08', 'C01DA14', 'C01DA58'])
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
    case 'calcium-based-phosphate-binder':
      // V03AE07 calcium acetate, V03AE04 with magnesium carbonate.
      return code === 'V03AE07' || code === 'V03AE04'
    case 'non-calcium-phosphate-binder':
      // Listed rather than prefixed: V03AE also holds the potassium binders
      // (V03AE01 polystyrene sulfonate, V03AE09, V03AE10), which bind no
      // phosphate and must not be read as phosphate-lowering treatment.
      return ['V03AE02', 'V03AE03', 'V03AE05', 'V03AE06', 'V03AE08'].includes(code)
    case 'iron-therapy':
      // B03A covers oral (B03AA/AB/AD/AE) and parenteral (B03AC) iron.
      return code.startsWith('B03A')
    case 'erythropoiesis-stimulating-agent':
      // B03XA holds ESAs and HIF-PHIs together, so a prefix would conflate
      // the two agent classes the guideline asks to be told apart.
      return code === 'B03XA01' || code === 'B03XA02' || code === 'B03XA03'
    case 'hif-phi':
      return code === 'B03XA05' || code === 'B03XA07' || code === 'B03XA08'
    case 'aspirin':
      // B01AC06 antiplatelet aspirin, B01AC56 with a PPI, N02BA01 the analgesic
      // salicylate. Multi-ingredient combinations are left to the name pattern,
      // because B01AC30 "combinations" does not itself imply aspirin.
      return code === 'B01AC06' || code === 'B01AC56' || code === 'N02BA01'
    case 'p2y12-inhibitor':
      // Listed, not prefixed: B01AC also holds aspirin, dipyridamole, cilostazol
      // and the prostacyclins, none of which act on P2Y12.
      return ['B01AC04', 'B01AC05', 'B01AC22', 'B01AC24', 'B01AC25'].includes(code)
    case 'direct-oral-anticoagulant':
      // B01AF is entirely oral direct factor Xa inhibitors. B01AE is taken one
      // code at a time because it also holds the parenteral direct thrombin
      // inhibitors (argatroban, bivalirudin), which are not DOACs.
      return code === 'B01AE07' || code.startsWith('B01AF')
    case 'vitamin-k-antagonist':
      return code.startsWith('B01AA')
    case 'low-molecular-weight-heparin':
      // Listed rather than prefixed: B01AB01 is unfractionated heparin and
      // B01AB09 danaparoid is a heparinoid, neither of which is an LMWH.
      return [
        'B01AB04', 'B01AB05', 'B01AB06', 'B01AB07', 'B01AB08', 'B01AB10', 'B01AB12',
      ].includes(code)
    case 'ivabradine':
      return code === 'C01EB17'
    case 'vericiguat':
      return code === 'C01DX22'
    case 'hydralazine-isdn':
      // No ATC code names the two-tablet regimen, so the structural path runs
      // through the component matchers in classifyCurrentMedications instead.
      return false
    case 'digoxin':
      return code === 'C01AA04' || code === 'C01AA05' || code === 'C01AA08'
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

/**
 * Per-record reading of the two-state cloud record. `not-taking` is deliberately
 * not a `CdssMedicationClassState`: a single record that is not being taken says
 * nothing on its own — only the whole class rolls up to `not-found`.
 */
export type ClassifiedMedicationState =
  | Extract<CdssMedicationClassState, 'confirmed-current' | 'on-hold'>
  | 'not-taking'

export interface ClassifiedMedication {
  classId: CdssMedicationClassId
  name: string
  medication: MedicationEntity
  state: ClassifiedMedicationState
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
    // Resolved from the governed NHI drug master. The prescription text is
    // often a trade name only, so the official name and ingredient are what
    // actually make an ingredient-level pattern match.
    medication.drugTerminology?.officialNameZh,
    medication.drugTerminology?.officialNameEn,
    medication.drugTerminology?.ingredientText,
    medication.drugTerminology?.atcNameZh,
    medication.drugTerminology?.atcNameEn,
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

/**
 * `Duration` -> days. Only units that can be read with certainty are converted;
 * anything else (including a missing unit) is reported as unreadable so the
 * caller treats the supply window as absent rather than guessing at it.
 */
function supplyDurationDays(duration: unknown): number | undefined {
  const quantity = duration as {
    value?: unknown
    unit?: unknown
    code?: unknown
  } | null | undefined
  const value = Number(quantity?.value)
  if (!Number.isFinite(value) || value <= 0) return undefined

  const unit = String(quantity?.code ?? quantity?.unit ?? '').trim().toLowerCase()
  if (/^(?:d|day|days|天|日)$/.test(unit)) return value
  if (/^(?:wk|w|week|weeks|週|周|星期)$/.test(unit)) return value * 7
  if (/^(?:mo|month|months|月|個月)$/.test(unit)) return value * 30
  if (/^(?:a|y|yr|year|years|年)$/.test(unit)) return value * 365
  if (/^(?:h|hr|hour|hours|小時)$/.test(unit)) return value / 24
  return undefined
}

/** `authoredOn + dispenseRequest.expectedSupplyDuration`, when both are readable. */
function supplyEndMs(medication: MedicationEntity): number | undefined {
  const days = supplyDurationDays(medication.dispenseRequest?.expectedSupplyDuration)
  if (days === undefined) return undefined
  const startMs = Date.parse(medication.authoredOn ?? '')
  if (!Number.isFinite(startMs)) return undefined
  return startMs + days * DAY_MS
}

/**
 * The one definition of "病人有在用這個藥" for the whole adapter: an `active`
 * prescription, or a `completed` one whose supply ran out no more than
 * PRESCRIPTION_GRACE_DAYS ago. A `completed` prescription with no readable
 * supply window cannot be placed in time, so it does not count.
 */
export function isMedicationBeingTaken(
  medication: MedicationEntity,
  now: Date = new Date(),
): boolean {
  const status = (medication.status ?? '').trim().toLowerCase()
  if (EXCLUDED_MEDICATION_STATUSES.has(status)) return false
  if (status === 'active') return true
  // `completed`, `unknown` and a missing status all describe a prescription the
  // record does not settle either way, so the supply window is what decides.
  // `on-hold`, `stopped` and `draft` do settle it, and settle it as not taken.
  if (status !== 'completed' && status !== 'unknown' && status !== '') return false
  const endMs = supplyEndMs(medication)
  if (endMs === undefined) return false
  return now.getTime() - endMs <= PRESCRIPTION_GRACE_DAYS * DAY_MS
}

/**
 * The day this prescription's supply runs out, as an ISO date. Undefined under
 * exactly the condition that stops a `completed` prescription from counting as
 * taken, so a caller that has no date here has no supply window to report.
 */
export function medicationSupplyEndDate(
  medication: MedicationEntity,
): string | undefined {
  const endMs = supplyEndMs(medication)
  if (endMs === undefined) return undefined
  return new Date(endMs).toISOString().slice(0, 10)
}

function medicationRecordState(
  medication: MedicationEntity,
  now: Date,
): ClassifiedMedicationState {
  // The NHI cloud never sends `on-hold`; a directly connected hospital EHR can,
  // and a held prescription is neither being taken nor simply absent.
  if ((medication.status ?? '').trim().toLowerCase() === 'on-hold') return 'on-hold'
  return isMedicationBeingTaken(medication, now) ? 'confirmed-current' : 'not-taking'
}

/**
 * Codings a class match may rely on. The drug master resolves an ATC code that
 * carries no `system` of its own, so it is presented as an ATC coding here —
 * otherwise the structural path is limited to bundles that already ship ATC.
 */
function medicationCodings(medication: MedicationEntity): CodingLike[] {
  const atcCode = medication.drugTerminology?.atcCode?.trim()
  return [
    ...(medication.medicationCodeableConcept?.coding ?? []),
    ...(atcCode
      ? [{ system: 'http://www.whocc.no/atc', code: atcCode, display: medication.drugTerminology?.atcNameEn }]
      : []),
  ]
}

export function medicationDisplayName(medication: MedicationEntity): string {
  return medication.drugTerminology?.ingredientText?.trim()
    || medication.drugTerminology?.officialNameEn?.trim()
    || medication.medicationCodeableConcept?.text
    || medication.medicationCodeableConcept?.coding?.find((coding) => coding.display)?.display
    || medication.medicationReference?.display
    || '未命名藥物'
}

export function currentMedicationRecords(
  medications: readonly MedicationEntity[],
  now: Date = new Date(),
): MedicationEntity[] {
  return medications.filter((medication) => (
    Boolean(medication.id) && isMedicationBeingTaken(medication, now)
  ))
}

export function classifyCurrentMedications(
  medications: readonly MedicationEntity[],
  now: Date = new Date(),
): {
  classified: readonly ClassifiedMedication[]
  unclassifiedAntidiabeticCount: number
} {
  const governedRecords = medications.filter((medication) => (
    Boolean(medication.id)
    && !EXCLUDED_MEDICATION_STATUSES.has((medication.status ?? '').trim().toLowerCase())
  ))
  const classified: ClassifiedMedication[] = []
  let unclassifiedAntidiabeticCount = 0

  for (const medication of governedRecords) {
    const searchable = searchableMedicationText(medication)
    const matchedClasses = medicationClassesFromEvidence({
      texts: [searchable],
      codings: medicationCodings(medication),
    })

    for (const classId of matchedClasses) {
      classified.push({
        classId,
        name: medicationDisplayName(medication),
        medication,
        state: medicationRecordState(medication, now),
      })
    }

    if (
      matchedClasses.length === 0
      && isMedicationBeingTaken(medication, now)
      && ANTIDIABETIC_CATEGORY.test(searchable)
      && !RECOGNIZED_OTHER_ANTIDIABETIC.test(searchable)
    ) {
      unclassifiedAntidiabeticCount += 1
    }
  }

  classified.push(...hydralazineIsdnConjunction(governedRecords, classified, now))

  return { classified, unclassifiedAntidiabeticCount }
}

/**
 * `hydralazine-isdn` is the only class a single prescription cannot answer:
 * Taiwan has no fixed-dose product, so the regimen appears as a hydralazine
 * record and a nitrate record that mean H-ISDN only together. Neither half is a
 * class of its own — hydralazine alone is an antihypertensive and a nitrate
 * alone is anti-anginal — so the components are matched here rather than in
 * CLASS_PATTERNS, and both must be currently taken before the class is present.
 * Both contributing records are returned so the card can cite what it read.
 */
function hydralazineIsdnConjunction(
  governedRecords: readonly MedicationEntity[],
  classified: readonly ClassifiedMedication[],
  now: Date,
): ClassifiedMedication[] {
  // A fixed-dose product already matched CLASS_PATTERNS, and would otherwise
  // satisfy both component scans on its own and be cited twice.
  const alreadyClassified = new Set(
    classified
      .filter((item) => item.classId === 'hydralazine-isdn')
      .map((item) => item.medication.id),
  )
  const componentsInUse = (
    pattern: RegExp,
    atcCodes: ReadonlySet<string>,
  ): MedicationEntity[] => governedRecords.filter((medication) => (
    !alreadyClassified.has(medication.id)
    && medicationRecordState(medication, now) === 'confirmed-current'
    && (
      pattern.test(searchableMedicationText(medication))
      || medicationCodings(medication).some((coding) => (
        isAtcSystem(coding.system) && atcCodes.has(normalizedCode(coding.code))
      ))
    )
  ))

  const hydralazine = componentsInUse(HYDRALAZINE_COMPONENT, HYDRALAZINE_ATC)
  const nitrate = componentsInUse(NITRATE_COMPONENT, NITRATE_ATC)
  if (hydralazine.length === 0 || nitrate.length === 0) return []

  const contributing = new Map<string, MedicationEntity>()
  for (const medication of [...hydralazine, ...nitrate]) {
    contributing.set(medication.id as string, medication)
  }
  return [...contributing.values()].map((medication) => ({
    classId: 'hydralazine-isdn' as const,
    name: medicationDisplayName(medication),
    medication,
    state: 'confirmed-current' as const,
  }))
}

export function assessMedicationClass(
  classified: ReturnType<typeof classifyCurrentMedications>,
  classId: CdssMedicationClassId,
): MedicationClassAssessment {
  const medications = classified.classified.filter((item) => item.classId === classId)
  const ingredientAmbiguityAffectsClass = (
    classId === 'insulin' || classId === 'sulfonylurea'
  )
  // No record, or only records that are not being taken, read the same way:
  // cross-institution data means absence is evidence of not taking. The one
  // genuine unknown left is an unmapped ingredient in the drug master.
  const notTakingState: CdssMedicationClassState = (
    ingredientAmbiguityAffectsClass && classified.unclassifiedAntidiabeticCount > 0
      ? 'uncertain'
      : 'not-found'
  )
  return {
    state: medications.some((item) => item.state === 'confirmed-current')
      ? 'confirmed-current'
      : medications.some((item) => item.state === 'on-hold')
        ? 'on-hold'
        : notTakingState,
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
    value: medicationDisplayName(medication),
    coding: medication.medicationCodeableConcept?.coding,
    facility: medication._sourceResourceType === 'MedicationStatement'
      ? medication.informationSource?.display
      : medication.requester?.display,
    sourceSystem: medication.sourceSystem,
    }))
}
