/**
 * The heart-failure page, read out of the pack's own output.
 *
 * A heart-failure visit asks three questions in this order — who is this and
 * what do I measure today, which drug decisions are open, and what else is
 * outstanding — so the page is three blocks and the model has three parts:
 * the status line and today's inputs, the therapy rows, and everything the
 * first two did not consume.
 *
 * Nothing here is a clinical rule. Every status, sentence, and value is the
 * pack's; this file only decides which of the pack's statements sit where. The
 * one interpretation it makes — that a therapy fact beginning 「目前用藥中」
 * means the class is being taken — reads the adapter's fixed wording for that
 * state, not the medication record.
 */
import type {
  CdssFact,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  CdssResult,
  CdssStatus,
  ClinicalEvidence,
} from '../types'
import {
  type ClinicEntryContext,
  type ClinicEntryContextMap,
  CLINIC_ENTRY_PATTERN,
} from '../utils/apply-clinic-vitals'
import { isClinicMetricKey } from '../stores/clinic-vitals.store'
import { bmiValueText, deriveBmi } from '@voho0000/personalized-care'

export const HEART_FAILURE_PACK_ID = 'heart-failure-cdss'

const PHENOTYPE_MODULE_ID = 'heart-failure-phenotype'
const FMT_SAFETY_MODULE_ID = 'heart-failure-fmt-safety'
const GDMT_MODULE_ID = 'heart-failure-hfref-gdmt'

/**
 * A tile in the therapy board.
 *
 * `therapyFactKeys` are the adapter's medication-class facts for the class,
 * read when the pack produced no module for it — the clinician still wants to
 * see what the patient is on, and a tile built that way carries no judgement
 * and says so.
 *
 * `noteZh`/`noteEn` is a standing the pack's status cannot carry: on the HFpEF
 * pathway an ARNI/ACEI/ARB is a Class IIb 「may be considered」, not a pillar,
 * and a tile that showed only 「需臨床確認」 beside the two Class I tiles would
 * read as the same strength of recommendation.
 *
 * `outOfScopeZh`/`outOfScopeEn` is what the tile says when the pack produced no
 * module *because the guideline scopes the class out of this phenotype* — a
 * beta-blocker, which ESC 2026 recommends for HFrEF and says nothing about in
 * HFpEF, and an incretin, whose recommendation is written for patients with
 * obesity or type 2 diabetes. Only these two carry it: everywhere else an
 * absent module means the pack did not judge, which is a different sentence.
 */
interface PillarModule {
  id: string
  zh: string
  en: string
  therapyFactKeys: readonly string[]
  noteZh?: string
  noteEn?: string
  outOfScopeZh?: string
  outOfScopeEn?: string
}

/** The four foundational classes of the HFrEF pathway, in the guideline's order. */
const HFREF_PILLAR_MODULES: readonly PillarModule[] = [
  { id: 'heart-failure-ras-inhibition', zh: 'ARNI／ACEI／ARB', en: 'ARNI / ACEI / ARB', therapyFactKeys: ['arniTherapy', 'aceArbTherapy'] },
  { id: 'heart-failure-beta-blocker', zh: '實證 β 阻斷劑', en: 'Evidence-based β-blocker', therapyFactKeys: ['hfEvidenceBetaBlockerTherapy'] },
  { id: 'heart-failure-mra', zh: 'MRA', en: 'MRA', therapyFactKeys: ['mraTherapy'] },
  { id: 'heart-failure-sglt2', zh: 'SGLT2i', en: 'SGLT2i', therapyFactKeys: ['sglt2Therapy'] },
]

/**
 * The HFpEF pathway's five classes, strongest recommendation first.
 *
 * ESC 2026 recommends an SGLT2 inhibitor and an MRA independent of LVEF, rates
 * an ACE-I/ARB/ARNI 「may be considered」, gives no beta-blocker recommendation
 * for this phenotype at all, and adds an incretin for the patient with obesity
 * or type 2 diabetes. The order and the notes are that reading, so a clinician
 * scanning left to right sees the strength fall.
 */
const HFPEF_PILLAR_MODULES: readonly PillarModule[] = [
  { id: 'heart-failure-hfpef-sglt2', zh: 'SGLT2i', en: 'SGLT2i', therapyFactKeys: ['sglt2Therapy'] },
  { id: 'heart-failure-hfpef-mra', zh: 'MRA', en: 'MRA', therapyFactKeys: ['mraTherapy', 'finerenoneTherapy'] },
  {
    id: 'heart-failure-hfpef-glp1',
    zh: 'GLP-1 RA',
    en: 'GLP-1 RA',
    therapyFactKeys: ['glp1RaTherapy'],
    // The pack's gate is the BMI: it produces no card where a computed BMI is
    // below 30 with no T2DM, and where no BMI could be computed and neither
    // code is on the record. The tile names both, because 「無診斷」 alone
    // would read as a code problem to a clinician whose patient has a BMI of
    // 26.
    outOfScopeZh: '不適用（BMI 未達 30 或無 BMI，且無 T2DM／肥胖診斷）',
    outOfScopeEn: 'Out of scope (BMI below 30 or not computable, and no T2DM or obesity diagnosis)',
  },
  {
    id: 'heart-failure-hfpef-ras',
    zh: 'ARNI／ACEI／ARB',
    en: 'ARNI / ACEI / ARB',
    therapyFactKeys: ['arniTherapy', 'aceArbTherapy'],
    noteZh: 'IIb 可考慮',
    noteEn: 'IIb may be considered',
  },
  {
    id: 'heart-failure-hfpef-beta-blocker',
    zh: 'β 阻斷劑',
    en: 'β-blocker',
    therapyFactKeys: ['hfEvidenceBetaBlockerTherapy', 'betaBlockerTherapy'],
    outOfScopeZh: 'HFpEF 無建議',
    outOfScopeEn: 'No HFpEF recommendation',
  },
]

/** Which phenotype's treatment cards the pack produced this visit. */
export type HeartFailurePillarPathway = 'hfrEF' | 'hfpEF'

/**
 * Which tile set to show, read from the module ids the pack produced.
 *
 * The card ids are the most robust signal available: they are the pack's own
 * contract, they are not localised, and the HFpEF pathway always emits the
 * SGLT2i, MRA and ACE-I/ARB/ARNI cards while the HFrEF pathway always emits
 * the GDMT card and its four pillars. The phenotype card's title says the same
 * thing in prose, which changes with the copy and with the locale, so it is
 * not used. Neither set present means neither pathway opened, and the board
 * keeps today's behaviour: the HFrEF tiles, read from the record alone.
 */
function pillarPathwayOf(ids: ReadonlySet<string>): HeartFailurePillarPathway | undefined {
  if (HFPEF_PILLAR_MODULES.some((config) => ids.has(config.id))) return 'hfpEF'
  if (ids.has(GDMT_MODULE_ID) || HFREF_PILLAR_MODULES.some((config) => ids.has(config.id))) {
    return 'hfrEF'
  }
  return undefined
}

export type HeartFailureMetricKind = 'lab' | 'measure'

/**
 * The safety inputs the status line prints, in the order the design puts them:
 * the biomarker, the three electrolytes and kidney values every FMT decision
 * reads, then what a clinic measures. `kind` says how a missing one is
 * obtained, which is the only thing a reader can do about it.
 */
const STATUS_METRICS: readonly {
  factKey: string
  zh: string
  en: string
  kind: HeartFailureMetricKind
  /** Evidence-table rows that carry this measurement when no fact does. */
  evidenceItemIds?: readonly string[]
}[] = [
  {
    factKey: 'NTproBNP',
    zh: 'NT-proBNP',
    en: 'NT-proBNP',
    kind: 'lab',
    evidenceItemIds: ['congestion:nt-probnp'],
  },
  { factKey: 'potassium', zh: 'K', en: 'K', kind: 'lab' },
  { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
  { factKey: 'sodium', zh: 'Na', en: 'Na', kind: 'lab' },
  { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
  { factKey: 'bodyWeight', zh: '體重', en: 'Weight', kind: 'measure' },
  { factKey: 'heartRate', zh: '心率', en: 'HR', kind: 'measure' },
]

const UNIT_PATTERN = /\s*(?:mmHg|bpm|mmol\/L|mEq\/L|mL\s*\/\s*min\s*\/\s*1\.73\s*m(?:²|\^?2)|mg\/dL|pg\/mL|ng\/L|kg|cm)(?![A-Za-z])/gi
/** The parenthetical `agedFactEvidence` appends to a value past its window. */
const STALE_NOTE_PATTERN = /[（(][^（()）]*(?:已 \d+ 天|\d+ d old|超過 \d+ 天窗|past the \d+-day window)[^（()）]*[）)]/
const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/

export interface HeartFailureMetric {
  factKey: string
  label: string
  kind: HeartFailureMetricKind
  /** The measurement without its unit or stale note; undefined when absent. */
  value?: string
  /** The evidence value as the pack wrote it, for the tooltip. */
  fullValue?: string
  unit?: string
  date?: string
  ageDays?: number
  /** The pack marked the value as past its monitoring window. */
  stale: boolean
  /** The physician entered this value rather than the record holding it. */
  entered: boolean
  /** The day it was entered, when `entered`. */
  enteredAt?: string
  /**
   * The record's own value for this key, as the adapter wrote it — what the
   * entered one replaced, and what 「撤銷」 restores. Absent when the record
   * held nothing for the key.
   */
  recordValue?: string
  recordDate?: string
  /** The physician can enter or correct this value in place on the line. */
  editable: boolean
  /**
   * A pack module carried this value this visit. `false` when the record holds
   * the value but no module ran that reads it — a patient outside the HFrEF
   * pathway gets the phenotype card alone, which names LVEF and NT-proBNP and
   * nothing else — so the tile shows the measurement without a judgement
   * behind it. The distinction matters: 「未取得」 asks the clinician to order
   * a test the laboratory already ran.
   */
  evaluated: boolean
  /** Where the value came from, for the source link. */
  evidence?: ClinicalEvidence
}

export interface HeartFailurePillar {
  id: string
  label: string
  /**
   * The pack's module for this pillar. Absent when the pack did not evaluate
   * it for this phenotype; the tile then shows the therapy fact alone.
   */
  recommendation?: CdssRecommendation
  status?: CdssStatus
  /** `false` when the tile is read from the record without a pack judgement. */
  evaluated: boolean
  /** The class is being taken, read from the adapter's therapy fact. */
  taking: boolean
  /** 「Valsartan 80mg」 — the names after 「目前用藥中：」 when taking. */
  medicationNames?: string
  /** The therapy fact as written, shown when the class is not being taken. */
  therapyText?: string
  therapyDate?: string
  therapyEvidence?: ClinicalEvidence
  /**
   * The one sentence the therapy row shows: the pack card's own title when a
   * card exists, otherwise the adapter's therapy fact. Never composed here —
   * a gate line the pack did not state is a gate line that does not exist.
   */
  sentence?: string
  /** The decisions this therapy's card offers, if it offers any. */
  decisionOptions?: CdssRecommendation['decisionOptions']
  /** The decision the physician already recorded on this therapy. */
  decision?: CdssRecommendation['physicianDecision']
  nextAction?: string
  /** A standing the status cannot carry — 「IIb 可考慮」 on the HFpEF RAS tile. */
  note?: string
  /**
   * The pack produced no module because the guideline scopes this class out of
   * the phenotype, so the tile says which scope rather than 「本次未判定」.
   */
  outOfScope?: string
}

export interface HeartFailureBoardModel {
  /** 「HFrEF」／「HFpEF」／「未分型」 — the word block 1 opens with. */
  phenotypeWord: string
  phenotype?: CdssRecommendation
  /** Always present, 「無」 included: an absent value is one a physician can enter. */
  lvef: HeartFailureMetric
  metrics: readonly HeartFailureMetric[]
  /**
   * The height, which the dialog asks for and the line does not print.
   *
   * A BMI needs it and 健保雲端 holds one only where a 成人預防保健 upload put
   * it there, so the physician must be able to enter it. It stays off the line
   * because a number that does not change between visits earns no slot on a
   * line read at every one.
   */
  height: HeartFailureMetric
  /** How many modules the pack judged this visit. */
  evaluatedCount: number
  /**
   * The FMT safety card. Its verdict is printed as one amber line at the top
   * of the therapy block when it is not `no-action`; it never gets a block of
   * its own, because a safety line nobody has to act on is a line that teaches
   * the eye to skip that corner of the screen.
   */
  fmtSafety?: CdssRecommendation
  /** The four-pillar card, whose title is the therapy block's heading. */
  gdmt?: CdssRecommendation
  /** Which phenotype's therapy set `pillars` holds; absent when neither opened. */
  pillarPathway?: HeartFailurePillarPathway
  pillars: readonly HeartFailurePillar[]
  /** How many of the therapy rows the record shows as being taken. */
  takingCount: number
  /** Everything blocks 1 and 2 did not consume, in reading order. */
  listRows: readonly CdssRecommendation[]
  /** Module ids the board renders itself, so the list does not repeat them. */
  consumedIds: ReadonlySet<string>
}

function latestSourceDate(evidence: ClinicalEvidence | undefined): string | undefined {
  const dates = (evidence?.sources ?? [])
    .map((source) => source.date)
    .filter((date): date is string => Boolean(date))
    .sort()
  return dates.at(-1)
}

/**
 * The pack appends 「（醫師已決定：<label>，<date>）」 to a decided card's title
 * so every consumer sees the decision. The board renders that decision as its
 * own line beside the row, so the sentence drops the suffix rather than saying
 * it twice.
 */
export function stripDecisionSuffix(title: string): string {
  return title
    .replace(/\s*（醫師已決定：[^）]*）\s*$/u, '')
    .replace(/\s*\(physician decided: [^)]*\)\s*$/u, '')
    .trim()
}

export function daysBetween(fromIsoDate: string, now: Date): number | undefined {
  const from = new Date(fromIsoDate.length === 10 ? `${fromIsoDate}T00:00:00` : fromIsoDate)
  if (Number.isNaN(from.getTime())) return undefined
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000)
  return days < 0 ? 0 : days
}

/**
 * The evidence row for one fact. Modules print the same measurement with and
 * without the stale annotation, so the annotated row wins when one exists:
 * the board must not show a value as current because the first module that
 * mentioned it happened not to date it.
 */
function findEvidence(
  recommendations: readonly CdssRecommendation[],
  factKey: string,
): ClinicalEvidence | undefined {
  const exact = recommendations.flatMap((recommendation) => (
    recommendation.patientEvidence.filter((item) => (
      item.factKeys.length === 1 && item.factKeys[0] === factKey
    ))
  ))
  const loose = exact.length > 0
    ? exact
    : recommendations.flatMap((recommendation) => (
      recommendation.patientEvidence.filter((item) => item.factKeys.includes(factKey))
    ))
  return loose.find((item) => STALE_NOTE_PATTERN.test(item.value)) ?? loose[0]
}

/**
 * The collection date the adapter prints inside the value —
 * 「142/84 mmHg（2026-04-18）」 — or, for a value entered in the room,
 * the date with its provenance note: 「142/84 mmHg（2026-09-05 門診輸入）」.
 */
const INLINE_DATE_PATTERN = /\s*[（(]\s*(\d{4}-\d{2}-\d{2})(?:[,，\s]+[^（()）]*)?[）)]/

function compactValue(value: string): {
  value: string
  unit?: string
  stale: boolean
  inlineDate?: string
} {
  const stale = STALE_NOTE_PATTERN.test(value)
  const withoutNote = value.replace(STALE_NOTE_PATTERN, '').trim()
  const inlineDate = withoutNote.match(INLINE_DATE_PATTERN)?.[1]
  const withoutDate = withoutNote.replace(INLINE_DATE_PATTERN, '').trim()
  const unit = withoutDate.match(UNIT_PATTERN)?.[0]?.trim()
  const compact = withoutDate.replace(UNIT_PATTERN, '').replace(/\s+(?=[（(])/g, '').trim()
  return { value: compact || withoutDate, unit, stale, inlineDate }
}

function metricFromEvidence(
  config: (typeof STATUS_METRICS)[number],
  evidence: ClinicalEvidence | undefined,
  isEnglish: boolean,
  now: Date,
): HeartFailureMetric {
  const label = isEnglish ? config.en : config.zh
  const editable = isClinicMetricKey(config.factKey)
  if (!evidence) {
    return {
      factKey: config.factKey,
      label,
      kind: config.kind,
      stale: false,
      entered: false,
      editable,
      evaluated: false,
    }
  }
  const compact = compactValue(evidence.value)
  const date = latestSourceDate(evidence) ?? compact.inlineDate
  return {
    factKey: config.factKey,
    label,
    kind: config.kind,
    value: compact.value,
    fullValue: evidence.value,
    unit: compact.unit,
    date,
    ageDays: date ? daysBetween(date, now) : undefined,
    stale: compact.stale,
    entered: CLINIC_ENTRY_PATTERN.test(evidence.value),
    editable,
    evaluated: true,
    evidence,
  }
}

/**
 * What the physician entered, laid over the metric the pack printed.
 *
 * The value on the line is already the entered one — it travelled through the
 * profile and the pack recomputed from it — so this only says *that* it was
 * entered, when, and what it replaced. Nothing is judged and no value changes.
 */
function withClinicEntry(
  metric: HeartFailureMetric,
  context: ClinicEntryContext | undefined,
): HeartFailureMetric {
  if (!context) return metric
  return {
    ...metric,
    entered: true,
    enteredAt: context.enteredAt,
    ...(context.recordValue ? { recordValue: context.recordValue } : {}),
    ...(context.recordDate ? { recordDate: context.recordDate } : {}),
  }
}

/** What the record itself holds for a value, whichever way the line prints it. */
export interface HeartFailureRecordReading {
  /** The number as the line prints it, without its unit; absent when none. */
  value?: string
  unit?: string
  date?: string
}

/**
 * What the record holds for one value, whether or not an entered value now
 * covers it.
 *
 * The dialog prints this under every box — 「紀錄 63.6%（06-24）」 — so the
 * physician can see what they are overriding, and what emptying the box falls
 * back to. With nothing entered, the metric on the line *is* the record's
 * reading; with something entered, the record's own string was kept aside on
 * the metric and is read back through the same compaction the line used, so
 * the two print alike.
 */
export function metricRecordReading(metric: HeartFailureMetric): HeartFailureRecordReading {
  if (!metric.entered) {
    return metric.value === undefined
      ? {}
      : { value: metric.value, unit: metric.unit, date: metric.date }
  }
  if (!metric.recordValue) return {}
  const compact = compactValue(metric.recordValue)
  return {
    value: compact.value,
    unit: compact.unit,
    date: metric.recordDate ?? compact.inlineDate,
  }
}

function metricFromEvidenceTable(
  config: (typeof STATUS_METRICS)[number],
  recommendations: readonly CdssRecommendation[],
  isEnglish: boolean,
  now: Date,
): HeartFailureMetric | undefined {
  const ids = config.evidenceItemIds ?? []
  if (ids.length === 0) return undefined
  for (const recommendation of recommendations) {
    for (const table of recommendation.evidenceTables ?? []) {
      const item = table.items.find((candidate) => ids.includes(candidate.id) && candidate.value)
      if (!item?.value) continue
      const compact = compactValue(item.value)
      const date = item.date ?? compact.inlineDate
      return {
        factKey: config.factKey,
        label: isEnglish ? config.en : config.zh,
        kind: config.kind,
        value: compact.value,
        fullValue: item.value,
        unit: compact.unit,
        date,
        ageDays: date ? daysBetween(date, now) : undefined,
        stale: compact.stale,
        entered: CLINIC_ENTRY_PATTERN.test(item.value),
        editable: isClinicMetricKey(config.factKey),
        evaluated: true,
        evidence: {
          label: isEnglish ? item.label.en : item.label.zh,
          value: item.value,
          factKeys: [config.factKey],
          sources: item.sources,
        },
      }
    }
  }
  return undefined
}

/**
 * A safety input no module carried, read from the adapter's fact. The fact's
 * own wording — 「2.8 mmol/L（2026-08-20）」 — is kept as the value so the
 * tooltip and source link read the same as a module-carried one; only
 * `evaluated` says that no rule looked at it this visit.
 */
function metricFromFact(
  config: (typeof STATUS_METRICS)[number],
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
  now: Date,
  /**
   * The adapter's own freshness reading. A value no module carried has no
   * pack annotation to read staleness from, so the window it was already
   * judged against answers instead — never a window invented here.
   */
  freshness?: CdssPatientProfile['freshnessContexts'],
): HeartFailureMetric | undefined {
  const fact = facts?.[config.factKey] as CdssFact | undefined
  if (!fact) return undefined
  const text = isEnglish ? fact.en : fact.zh
  if (!text?.trim()) return undefined
  const compact = compactValue(text)
  const evidence: ClinicalEvidence = {
    label: isEnglish ? config.en : config.zh,
    value: text,
    factKeys: [config.factKey],
    sources: fact.sources,
  }
  const date = fact.date ?? latestSourceDate(evidence) ?? compact.inlineDate
  return {
    factKey: config.factKey,
    label: isEnglish ? config.en : config.zh,
    kind: config.kind,
    value: compact.value,
    fullValue: text,
    unit: compact.unit ?? fact.unit,
    date,
    ageDays: date ? daysBetween(date, now) : undefined,
    stale: compact.stale || (() => {
      const state = freshness?.[config.factKey]?.state
      return state === 'due' || state === 'overdue'
    })(),
    entered: CLINIC_ENTRY_PATTERN.test(text),
    editable: isClinicMetricKey(config.factKey),
    evaluated: false,
    evidence,
  }
}

/**
 * The BMI, derived from the height and the weight the pack read.
 *
 * The pack owns the formula (`deriveBmi`), so the number on the line is the
 * number on the incretin card by construction rather than by two files
 * agreeing. It is not editable and carries no 「撤銷」 of its own: undoing the
 * height or the weight is what removes it, because a derived value with an
 * undo button of its own would let the line hold a BMI its own inputs no
 * longer support.
 */
function bmiMetric(
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
): HeartFailureMetric | undefined {
  if (!facts) return undefined
  const bmi = deriveBmi({ facts })
  if (!bmi) return undefined
  const fullValue = bmiValueText(bmi, isEnglish ? 'en' : 'zh-TW')
  // The later of the two measurements: a BMI is no fresher than the older of
  // the numbers it came from, and no staler than the day the last one was
  // taken, so the line dates it by the reading that completed it.
  const date = [bmi.heightDate, bmi.weightDate]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  return {
    factKey: 'bmi',
    label: 'BMI',
    kind: 'measure',
    value: String(bmi.value),
    fullValue,
    unit: 'kg/m²',
    ...(date ? { date } : {}),
    stale: false,
    entered: false,
    editable: false,
    evaluated: false,
  }
}

function pillarFromRecommendation(
  config: PillarModule,
  recommendation: CdssRecommendation,
  isEnglish: boolean,
  facts?: CdssPatientProfile['facts'],
): HeartFailurePillar {
  const therapyKey = recommendation.overviewEvidenceFactKey
  const therapyEvidence = therapyKey
    ? recommendation.patientEvidence.find((item) => item.factKeys.includes(therapyKey))
    : undefined
  const therapyText = therapyEvidence?.value
  // A row covers a class, not one fact: the RAS pillar is 「ARNI, or an ACE-I
  // or ARB when an ARNI is not feasible」, and a patient on an ARB is on the
  // pillar even though the card's overview fact happens to be the ARNI one.
  // Reading only that fact printed 「無處方」 next to a live prescription and
  // made the row disagree with the pack's own 「N／4 在用」.
  const takingAnyClass = (config.therapyFactKeys as readonly string[]).some((key) => {
    const fact = facts?.[key] as CdssFact | undefined
    const value = fact ? (isEnglish ? fact.en : fact.zh) : undefined
    return value !== undefined && TAKING_PATTERN.test(value)
  })
  const takingOwnFact = therapyText !== undefined && TAKING_PATTERN.test(therapyText)
  const taking = takingOwnFact || takingAnyClass
  // Only the card's own fact names the drug; a sibling class establishing that
  // the pillar is in use does not say which product, and the row must not
  // print a name that came from a different fact.
  const medicationNames = takingOwnFact
    ? therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
    : undefined
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    recommendation,
    status: recommendation.status,
    evaluated: true,
    taking,
    medicationNames,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence),
    therapyEvidence,
    // The pack's own sentence for this therapy, never rewritten and never
    // supplemented: a gate line the pack did not state does not appear.
    sentence: stripDecisionSuffix(recommendation.title),
    ...(recommendation.decisionOptions ? { decisionOptions: recommendation.decisionOptions } : {}),
    ...(recommendation.physicianDecision ? { decision: recommendation.physicianDecision } : {}),
    nextAction: recommendation.nextActions[0],
  }
}

/**
 * A pillar the pack did not evaluate, read from the adapter's therapy facts.
 * For a pillar with two classes (ARNI or ACEI/ARB) the class being taken
 * wins; otherwise the first fact the record holds.
 */
function pillarFromFacts(
  config: PillarModule,
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
): HeartFailurePillar | undefined {
  if (!facts) return undefined
  const candidates = (config.therapyFactKeys as readonly string[])
    .map((key) => ({ key, fact: facts[key] as CdssFact | undefined }))
    .filter((entry): entry is { key: string; fact: CdssFact } => Boolean(entry.fact))
  if (candidates.length === 0) return undefined
  const textOf = (fact: CdssFact) => (isEnglish ? fact.en : fact.zh)
  const chosen = candidates.find((entry) => TAKING_PATTERN.test(textOf(entry.fact))) ?? candidates[0]
  const therapyText = textOf(chosen.fact)
  const taking = TAKING_PATTERN.test(therapyText)
  const therapyEvidence: ClinicalEvidence = {
    label: isEnglish ? config.en : config.zh,
    value: therapyText,
    factKeys: [chosen.key],
    sources: chosen.fact.sources,
  }
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    evaluated: false,
    taking,
    medicationNames: taking
      ? therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
      : undefined,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence) ?? chosen.fact.date,
    therapyEvidence,
    sentence: therapyText,
  }
}

/** The word block 1 opens with: the pathway the pack's own cards opened. */
function phenotypeWordOf(
  pathway: HeartFailurePillarPathway | undefined,
  isEnglish: boolean,
): string {
  if (pathway === 'hfpEF') return 'HFpEF'
  if (pathway === 'hfrEF') return 'HFrEF'
  return isEnglish ? 'Phenotype not established' : '未分型'
}

/**
 * Reads the board out of a result. `undefined` for any pack that is not the
 * heart-failure pack, so every other pathway keeps the generic module table.
 */
export function buildHeartFailureBoard(
  result: CdssResult,
  locale: CdssLocale,
  now: Date = new Date(),
  /**
   * The profile the pack read, for pillars the pack produced no module for and
   * safety inputs no module carried.
   */
  profileFacts?: CdssPatientProfile['facts'],
  /** The adapter's freshness contexts, for a value no module carried. */
  profileFreshness?: CdssPatientProfile['freshnessContexts'],
  /**
   * Which values on the line the physician entered, and what each replaced.
   * The value itself already arrived through the profile; this only lets the
   * line say so without reading the provenance note out of a printed string.
   */
  clinicEntries?: ClinicEntryContextMap,
): HeartFailureBoardModel | undefined {
  if (result.packId !== HEART_FAILURE_PACK_ID) return undefined
  const isEnglish = locale === 'en'
  const recommendations = [
    ...result.recommendations,
    ...(result.automatedChecks ?? [])
      .map((check) => check.recommendation)
      .filter((item): item is CdssRecommendation => Boolean(item)),
  ]
  const byId = new Map(recommendations.map((item) => [item.id, item]))

  const phenotype = byId.get(PHENOTYPE_MODULE_ID)
  const entryOf = (factKey: string): ClinicEntryContext | undefined => (
    isClinicMetricKey(factKey) ? clinicEntries?.[factKey] : undefined
  )
  // Every value on the line can be entered by hand, so LVEF gets a metric even
  // when nothing holds it: 「無」 is a value the physician can correct, and a
  // slot that only appears once a record carries a number cannot be corrected
  // at all.
  const lvefConfig = { factKey: 'LVEF', zh: 'LVEF', en: 'LVEF', kind: 'lab' as const }
  const lvefEvidence = findEvidence(recommendations, 'LVEF')
  const lvef = withClinicEntry(
    lvefEvidence
      ? metricFromEvidence(lvefConfig, lvefEvidence, isEnglish, now)
      : metricFromFact(lvefConfig, profileFacts, isEnglish, now, profileFreshness)
        ?? metricFromEvidence(lvefConfig, undefined, isEnglish, now),
    entryOf('LVEF'),
  )

  const heightConfig = { factKey: 'height', zh: '身高', en: 'Height', kind: 'measure' as const }
  const height = withClinicEntry(
    metricFromFact(heightConfig, profileFacts, isEnglish, now, profileFreshness)
      ?? metricFromEvidence(heightConfig, undefined, isEnglish, now),
    entryOf('height'),
  )

  const metrics = STATUS_METRICS.map((config) => {
    const evidence = findEvidence(recommendations, config.factKey)
    const metric = evidence
      ? metricFromEvidence(config, evidence, isEnglish, now)
      : metricFromEvidenceTable(config, recommendations, isEnglish, now)
        ?? metricFromFact(config, profileFacts, isEnglish, now, profileFreshness)
        ?? metricFromEvidence(config, undefined, isEnglish, now)
    return withClinicEntry(metric, entryOf(config.factKey))
  })
  const bmi = bmiMetric(profileFacts, isEnglish)
  const metricsWithBmi = bmi
    ? metrics.flatMap((metric) => (
      metric.factKey === 'bodyWeight' ? [metric, bmi] : [metric]
    ))
    : metrics

  const pillarPathway = pillarPathwayOf(new Set(byId.keys()))
  // Neither pathway opened: the record holds no LVEF below 50% and no set of
  // HFpEF criteria, so there is no drug decision to lay out. Four rows of
  // 「本次未判定」 would look like an answer and are not one — the block says
  // what would open them instead.
  const pillarModules = pillarPathway === 'hfpEF'
    ? HFPEF_PILLAR_MODULES
    : pillarPathway === 'hfrEF'
      ? HFREF_PILLAR_MODULES
      : []
  const pillars = pillarModules.flatMap((config) => {
    const recommendation = byId.get(config.id)
    const outOfScope = !recommendation && config.outOfScopeZh
      ? (isEnglish ? config.outOfScopeEn : config.outOfScopeZh)
      : undefined
    const base = recommendation
      ? pillarFromRecommendation(config, recommendation, isEnglish, profileFacts)
      : pillarFromFacts(config, profileFacts, isEnglish)
        // A class the guideline scopes out of this phenotype still gets a row
        // even when the record holds no fact for it: 「HFpEF 無建議」 is the
        // answer to a question the clinician is asking, and a missing row is
        // not an answer at all.
        ?? (outOfScope
          ? {
              id: config.id,
              label: isEnglish ? config.en : config.zh,
              evaluated: false,
              taking: false,
            }
          : undefined)
    if (!base) return []
    const note = isEnglish ? config.noteEn : config.noteZh
    return [{
      ...base,
      ...(note ? { note } : {}),
      ...(outOfScope ? { outOfScope } : {}),
    }]
  })
  const evaluatedPillars = pillars.filter((pillar) => pillar.evaluated)
  const fmtSafety = byId.get(FMT_SAFETY_MODULE_ID)

  const consumedIds = new Set<string>([
    ...pillars.map((item) => item.id),
    // The therapy block's heading is the four-pillar card's own title, so its
    // row would say the same thing twice; it stays reachable from the heading.
    ...(evaluatedPillars.length > 0 && byId.has(GDMT_MODULE_ID) ? [GDMT_MODULE_ID] : []),
    // The FMT safety verdict is the amber line at the top of the therapy
    // block, so the list does not repeat it.
    ...(fmtSafety ? [FMT_SAFETY_MODULE_ID] : []),
  ])

  // Everything else, one row each: what to do, then what to fetch, then what
  // to judge, then what is done. Status carries the order, priority breaks
  // ties, and the pack's own module order settles the rest.
  const priorityRank: Readonly<Record<CdssRecommendation['priority'], number>> = { high: 0, medium: 1, routine: 2 }
  // A phenotype card that still carries a diagnosis decision is the gate the
  // rest of the page rests on, so it leads the list whatever its status.
  const gateRank = (item: CdssRecommendation): number => (
    item.id === PHENOTYPE_MODULE_ID && (item.decisionOptions?.length ?? 0) > 0 ? 0 : 1
  )
  const listRows = recommendations
    .filter((item) => !consumedIds.has(item.id))
    .sort((a, b) => (
      gateRank(a) - gateRank(b)
      || HEART_FAILURE_LIST_STATUS_ORDER.indexOf(a.status) - HEART_FAILURE_LIST_STATUS_ORDER.indexOf(b.status)
      || priorityRank[a.priority] - priorityRank[b.priority]
      || (a.moduleOrder ?? Number.MAX_SAFE_INTEGER) - (b.moduleOrder ?? Number.MAX_SAFE_INTEGER)
    ))

  return {
    phenotypeWord: phenotypeWordOf(pillarPathway, isEnglish),
    phenotype,
    lvef,
    height,
    metrics: metricsWithBmi,
    evaluatedCount: recommendations.length,
    ...(fmtSafety ? { fmtSafety } : {}),
    ...(evaluatedPillars.length > 0 && byId.has(GDMT_MODULE_ID)
      ? { gdmt: byId.get(GDMT_MODULE_ID) }
      : {}),
    ...(pillarPathway ? { pillarPathway } : {}),
    pillars,
    takingCount: pillars.filter((pillar) => pillar.taking).length,
    listRows,
    consumedIds,
  }
}

/**
 * The reading order for what the board did not consume: what to do, then
 * what to fetch, then what to judge, then what is done. Status carries the
 * order; priority breaks ties; the pack's own module order settles the rest.
 */
export const HEART_FAILURE_LIST_STATUS_ORDER: readonly CdssStatus[] = [
  'actionable',
  'needs-data',
  'review',
  'no-action',
]

export function formatMetricDate(date: string | undefined, now: Date): string | undefined {
  if (!date) return undefined
  const sameYear = date.slice(0, 4) === String(now.getFullYear())
  return sameYear && date.length >= 10 ? date.slice(5, 10) : date
}
