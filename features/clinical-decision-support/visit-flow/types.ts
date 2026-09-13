/**
 * One visit, as a model, for any disease the host draws the visit flow for.
 *
 * The heart-failure flow was the first and is still the reference: four steps,
 * one sentence saying what to do next, the numbers the record already holds,
 * the questions only a person can answer, a decision on every recommendation,
 * and a summary to paste into the chart. None of that is about heart failure.
 * What *is* about heart failure — which module is a question rather than an
 * action, what 「代償」 means, which reasons a beta-blocker can be deferred for
 * — now lives in a `VisitFlowDiseaseConfig`, and dyslipidemia is the second
 * one.
 *
 * Nothing here is a clinical rule. Every headline, module name, option label,
 * evidence value and coverage sentence is the pack's; the engine decides order,
 * grouping and what counts as done, and the config names which of the pack's
 * modules play which part.
 *
 * The model itself stays plain data and React-free: the ordering rules are the
 * part worth testing, and a test should not have to mount a tree to ask. The
 * one place a config hands back a React element — `VisitQuestionSpec.render` —
 * is read by the card, never by the builder.
 */
import type { ReactNode } from 'react'
import type { PhysicianInputRequest } from '../physician-input-contract'
import type {
  CdssClinicalHandoff,
  CdssFact,
  CdssLocale,
  CdssRecommendation,
  CdssResult,
  CdssStatus,
  ClinicalEvidence,
} from '../types'
import type { ClinicVitals, ClinicVitalsPatch } from '../stores/clinic-vitals.store'
import type { PhenotypeAnswer } from '../stores/phenotype-answer.store'
import type { PhysicianDecision, PhysicianDecisionMap } from '../stores/physician-decisions.store'
import type {
  VisitAnswers,
  VisitAnswerPatch,
  VisitQuestionAnswer,
} from '../stores/visit-answers.store'

/* ------------------------------------------------------------------ steps */

export type VisitStepState = 'done' | 'current' | 'todo' | 'na'

export interface VisitStep {
  id: string
  /** 1–4, as shown in the circle. */
  index: number
  label: string
  state: VisitStepState
  /** One line under the label, counted from the pack's own result. */
  detail: string
}

/* -------------------------------------------------------------- questions */

/**
 * A question's id. A string rather than a union, because the set of questions
 * belongs to the disease: heart failure asks about congestion, dyslipidemia
 * asks which risk factors the record cannot hold.
 */
export type VisitQuestionId = string

export type VisitQuestionState = 'open' | 'answered' | 'locked'

/**
 * Which side of a two-sided finding a row speaks for, or which rulebook an
 * item belongs to.
 *
 * A short tag, and nothing more: it tells a reader why 腳腫 and 端坐呼吸 are
 * not the same question, or why 腰圍 is asked at all, and it never reaches the
 * data model. Every answer travels as its own term whatever the tag says. The
 * palette and the wording are the config's — heart failure reads 肺／體／兩,
 * dyslipidemia reads 健保／指引／兩.
 */
export interface VisitItemTag {
  id: string
  tagZh: string
  tagEn: string
  legendZh: string
  legendEn: string
  /** Tailwind classes for the tag chip, light and dark. */
  className: string
}

/**
 * One row of an item question: a tag, a finding, and 有／無／未評估.
 *
 * `term` is the canonical id the answer is written under, so an answer given
 * here lands on the pack's own row; the labels are the screen's, or the pack's
 * where the pack supplied them. `common` rows are open by default and are what
 * 「本題已答」 is counted from — the rest fold behind 「更多 n 項」, because a
 * list of sixteen findings asked in full at every visit is a list nobody
 * answers.
 */
export interface VisitItem {
  term: string
  zh: string
  en: string
  /** The short form used on the folded one-line answer. */
  shortZh: string
  shortEn: string
  /**
   * Which `VisitItemTag` this row carries — 「肺」, 「體」, 「健保」. Named for
   * the first reading that needed it, which was the side of the heart.
   */
  side: string
  common: boolean
}

export interface VisitQuestion {
  id: VisitQuestionId
  /** What the circle shows: `1`, `1b`, `2`… */
  number: string
  /** The pack's own label where the pack asks; the host's for the rest. */
  label: string
  state: VisitQuestionState
  /** One line stating the answer, on an answered question. */
  answerText?: string
  /** When that answer was last changed, as an ISO timestamp. */
  modifiedAt?: string
  /** The one-line note under the question. */
  hint?: string
  /** The per-term rows this question asks, where it asks any. */
  items?: readonly VisitItem[]
  /** The tag legend and palette for those rows. */
  tags?: readonly VisitItemTag[]
  /** Whether the rows carry a legend line above them. */
  showLegend?: boolean
  /**
   * A chip beside the folded answer — 「肺鬱血 2 · 體循環 2」 on heart failure's
   * examination question. The config writes the words; the card prints them.
   */
  answerBadgeText?: string
  /**
   * The count behind that badge, keyed by tag id — 「肺鬱血 2 · 體循環 2」 as
   * two numbers. Present whenever the question keeps one, even at nought.
   */
  sideTally?: Readonly<Record<string, number>>
  /** Why a locked question is locked, in the words the reader needs. */
  lockedReason?: string
  /**
   * Whether this question is part of 「本次評估」's count. The ones a pack
   * raises conditionally are not: they belong to step ①, and a count that
   * moved when a card appeared would make 「還有 n 題」 mean something
   * different on every patient.
   */
  counted: boolean
  /** The pack's request, where this question is one the pack raised. */
  request?: PhysicianInputRequest
  /** The recommendation the request came from, for the panel that renders it. */
  recommendationId?: string
  /**
   * Draw the control beside the label rather than under it. The short
   * one-choice questions read better that way; a list of rows does not.
   */
  inlineControl?: boolean
  /**
   * Keep this question out of 「接下來」 even while it is open.
   *
   * A question the pack raised conditionally can stand open on a patient this
   * clinician has said the pathway is not for; sending them to it would be
   * telling them to answer a question they have already declined.
   */
  skipAsNextStep?: boolean
}

/* ---------------------------------------------------------------- actions */

export type VisitActionGroupId = 'safety' | 'actionable' | 'needs-data' | 'review' | 'no-action'

/** Which set of decision buttons a row offers. */
export type VisitDecisionKind =
  | 'medication'
  | 'test'
  | 'measurement'
  | 'follow-up'
  | 'rehabilitation'
  | 'exercise-safety'
  | 'review'
  | 'none'

/**
 * The pack's own 健保給付 verdict for one row, printed and never recomputed.
 *
 * The status is the pack's, the sentence is the pack's, and the host decides
 * only that the first sentence is the one that fits on a line.
 */
export interface VisitCoverage {
  status: 'covered' | 'not-covered' | 'needs-data' | 'recommended' | 'consider' | 'no-special-rule' | 'not-applicable'
  sourceLabel: string
  version: string
  summary: string
  firstSentence: string
  missingData?: readonly string[]
}

export interface VisitActionRow {
  /** Continuous across the groups that carry a decision; absent on 目前無需處理. */
  index?: number
  recommendation: CdssRecommendation
  /** The pack's own next step, which is the sentence a clinician acts on. */
  headline: string
  moduleName: string
  status: CdssStatus
  isSafety: boolean
  /** 「valsartan 80 mg」 — what the patient is on, on a foundational row. */
  medications?: string
  /** The overview evidence, and the first missing input where there is one. */
  basis?: string
  /** The pack's coverage verdict, where the config asked for the line. */
  coverage?: VisitCoverage
  decisionKind: VisitDecisionKind
  decision?: PhysicianDecision
  /** Derived from current therapy, never persisted as a physician action. */
  decisionSource?: 'medication-record'
}

export interface VisitActionGroup {
  id: VisitActionGroupId
  label: string
  rows: readonly VisitActionRow[]
  /** 目前無需處理 opens folded, with the module names on the folded line. */
  collapsedByDefault: boolean
  summary?: string
}

/* -------------------------------------------------------------- next step */

export type VisitNextStepTone = 'safety' | 'primary' | 'ok'

export type VisitNextStepTarget =
  | { kind: 'question'; questionId: VisitQuestionId }
  | { kind: 'action'; moduleId: string; index: number }
  | { kind: 'copy' }

export interface VisitNextStep {
  tone: VisitNextStepTone
  message: string
  actionLabel: string
  target: VisitNextStepTarget
  /** A second line, used on the first open to say what the record already holds. */
  hint?: string
}

/* ------------------------------------------------------------ carried-in */

export interface CarriedField {
  label: string
  value: string
  /** Already formatted for reading: `量測 2026/08/25` or `今日 14:02`. */
  date: string
}

/* ------------------------------------------------------------------ board */

export type VisitFlowMetricKind = 'lab' | 'measure' | 'derived'

/**
 * One number the record holds, as the board read it. Both disease boards —
 * `HeartFailureMetric` and `BoardMetric` — are this shape.
 */
export interface VisitFlowMetric {
  factKey: string
  label: string
  kind: VisitFlowMetricKind
  value?: string
  fullValue?: string
  unit?: string
  date?: string
  ageDays?: number
  stale: boolean
  entered: boolean
  evaluated?: boolean
  evidence?: ClinicalEvidence
}

/** One treatment track the board carries, as much of it as the engine reads. */
export interface VisitFlowPillar {
  id: string
  label: string
  taking: boolean
  medicationNames?: string
}

/**
 * What the engine reads off a disease board.
 *
 * Deliberately the smallest shape both boards satisfy: the visit flow needs
 * the framing number, what the pack marked dangerous, and which treatment
 * tracks the patient is already on. Everything else a board carries is drawn
 * by the disease's own config.
 */
export interface VisitFlowBoard {
  /** The one number the visit is framed by: LVEF, LDL-C. */
  headlineMetric?: VisitFlowMetric
  /** What the board calls the pathway: 「HFrEF」, 「ASCVD 極高風險」. */
  subtitle?: string
  metrics: readonly VisitFlowMetric[]
  /** Safety modules the pack marked actionable: read before anything else. */
  alerts: readonly CdssRecommendation[]
  pillars: readonly VisitFlowPillar[]
}

/* ------------------------------------------------------------------ model */

export interface VisitFlowModel {
  steps: readonly VisitStep[]
  nextStep: VisitNextStep
  /** The framing number and the inputs, in the order the board reads them. */
  metrics: readonly VisitFlowMetric[]
  questions: readonly VisitQuestion[]
  openQuestionCount: number
  answeredQuestionCount: number
  countedQuestionCount: number
  actionGroups: readonly VisitActionGroup[]
  decidedCount: number
  decidableCount: number
  summaryText: string
  englishSummaryText: string
  carriedFields: readonly CarriedField[]
  handoff?: CdssClinicalHandoff
  /** The pack's own follow-up sentence, where a monitoring module wrote one. */
  followUpNote?: string
  /** Extra follow-up lines the config computed from this visit's decisions. */
  followUpLines: readonly VisitFollowUpLine[]
  /** No patient loaded: every control is withheld and the rows say so. */
  readOnly: boolean
}

/** One line of 紀錄與追蹤 the host derived from what was decided today. */
export interface VisitFollowUpLine {
  id: string
  label: string
  value: string
  /** Where the interval comes from, printed under the value. */
  source?: string
}

/* ------------------------------------------------------------------ input */

export interface VisitFlowInput {
  board: VisitFlowBoard
  result: CdssResult
  isEnglish: boolean
  now: Date
  decisions: PhysicianDecisionMap
  /** Absent while no patient is loaded. */
  patientId?: string
  /** Heart failure's measurements and per-term answers. */
  clinicVitals?: ClinicVitals
  /** Heart failure's phenotype gate and HFpEF confirmation. */
  phenotypeAnswer?: PhenotypeAnswer
  /** The generic per-question answers, keyed by question id. */
  visitAnswers?: VisitAnswers
}

/** The input plus what the engine already worked out from the pack's result. */
export interface VisitFlowContext extends VisitFlowInput {
  /** Flattened recommendations, after the config's own normalisation. */
  recommendations: readonly CdssRecommendation[]
  byId: ReadonlyMap<string, CdssRecommendation>
  readOnly: boolean
}

/** The context a step's state is derived from: everything else is settled. */
export interface VisitFlowStepContext extends VisitFlowContext {
  questions: readonly VisitQuestion[]
  countedQuestions: readonly VisitQuestion[]
  openQuestionCount: number
  answeredQuestionCount: number
  actionGroups: readonly VisitActionGroup[]
  decidableCount: number
  decidedCount: number
  followUpNote?: string
  /** The follow-up lines the config derived, once they exist; the summary
   *  prints them and is therefore built after them. */
  followUpLines?: readonly VisitFollowUpLine[]
}

/* ----------------------------------------------------------------- config */

/** The reasons a deferral or a contraindication can be recorded under. */
export interface VisitDecisionReason {
  id: string
  zh: string
  en: string
}

export interface VisitStepSpec {
  id: string
  label: (isEnglish: boolean) => string
  /** The state and the one line under it, read off everything else. */
  derive: (ctx: VisitFlowStepContext) => { state: VisitStepState; detail: string }
}

/** What a question's control needs from the screen to draw itself. */
export interface VisitQuestionRenderContext {
  question: VisitQuestion
  isEnglish: boolean
  now: Date
  readOnly: boolean
  /** Keep this question's control open after an answer lands. */
  reopen: () => void
  /** Fold an item question back to its one-line answer. */
  collapse: () => void
  surface: VisitFlowSurface
}

/**
 * The stores and callbacks a config's own controls write through.
 *
 * One bag rather than a generic parameter: the host wires every store at one
 * place, and a question that does not use a field simply does not read it. A
 * field left undefined is a control the screen withholds — which is what
 * 「需載入病人才能作答」 means.
 */
export interface VisitFlowSurface {
  board: VisitFlowBoard
  isEnglish: boolean
  now: Date
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  phenotypeAnswer?: PhenotypeAnswer
  onAnswerPhenotype?: (answer: PhenotypeAnswer) => void
  visitAnswers?: VisitAnswers
  onSaveVisitAnswers?: (patch: VisitAnswerPatch) => void
  /** Heart failure's HFpEF calculator reading and the dialog that opens it. */
  hfpefReading?: unknown
  onOpenCalculator?: (id?: string) => void
  /** The diagnostic reading of one module, for a question that prints one. */
  recommendationById: (id: string) => CdssRecommendation | undefined
}

export interface VisitQuestionSpec {
  id: VisitQuestionId
  /**
   * Whether this question is put to this clinician at all. A question the
   * pack did not raise, or one a phenotype makes moot, never appears.
   */
  appliesWhen?: (ctx: VisitFlowContext) => boolean
  /** Everything but the control: label, state, answer text, stamps. */
  derive: (ctx: VisitFlowContext) => Omit<VisitQuestion, 'id'>
  /** The control drawn inside the question shell. */
  render?: (ctx: VisitQuestionRenderContext) => ReactNode
  /**
   * The facts this question's answers become, on the profile the pack reads.
   *
   * Nothing here judges. 「未評估」 and 「沒問」 both produce no fact, because
   * the pack must not read either as a negative finding; only 「無」 is a
   * negation, and it travels as its own term. A question that writes nothing
   * returns an empty record, which is what an unanswered question is.
   */
  toFacts?: (
    answer: VisitQuestionAnswer | undefined,
    options: { isEnglish: boolean; locale: CdssLocale },
  ) => Readonly<Record<string, CdssFact>>
}

/** A row's decision buttons, and the reasons behind the two that need one. */
export interface VisitDecisionRule {
  kind: VisitDecisionKind
  /** Which reason chips a decision offers; ids from `decisionReasons`. */
  reasons?: (decision: PhysicianDecision['decision'] | undefined) => readonly string[]
}

/** What 系統已從病歷讀到 draws, for one disease. */
export interface VisitRecordCardConfig {
  /** The tile drawn large, at the head of the grid. */
  headlineFactKey: string
  /** The order of the tiles, by fact key. Anything unlisted goes last. */
  order: readonly string[]
  /** Tiles the board does not carry but the clinician can still complete. */
  extraMetrics?: (surface: VisitFlowSurface) => readonly VisitFlowMetric[]
  /** The grid's column classes, so a nine-tile panel is not a six-tile one. */
  columnsClass?: string
  /**
   * A tile whose value is computed from two others — heart failure prints a
   * BMI where the height would be. `undefined` leaves the tile as it is.
   */
  deriveTile?: (
    metric: VisitFlowMetric,
    metrics: readonly VisitFlowMetric[],
    isEnglish: boolean,
  ) => { label: string; unit?: string; value?: string; source?: string; title?: string } | undefined
  /** Anything drawn inside a tile: heart failure's echo-report button. */
  renderTileExtra?: (metric: VisitFlowMetric, isEnglish: boolean) => ReactNode
  /**
   * A second line inside the large tile: the two goals the lipid targets are
   * read against, one per rulebook. Both sentences are the pack's.
   */
  headlineNote?: (args: { surface: VisitFlowSurface; isEnglish: boolean }) => ReactNode
}

export interface VisitFlowDiseaseConfig {
  /** Matches `CdssResult.packId`; this is what dispatch keys on. */
  packId: string
  /** `cdss-hf`, `cdss-lipid`: the prefix every test id on the screen carries. */
  testIdPrefix: string
  /**
   * A last reading of one recommendation before anything else sees it — heart
   * failure's medication-safety scan rewrites the row it found a problem on.
   */
  normalizeRecommendation?: (recommendation: CdssRecommendation) => CdssRecommendation
  /** 「確認心衰竭」, 「確認風險分級」 … in the order the circles are numbered. */
  steps: readonly VisitStepSpec[]
  questions: readonly VisitQuestionSpec[]
  /**
   * Modules some question already asks about, so 今日處置 does not list them a
   * second time. Heart failure's phenotype gate; dyslipidemia's risk module.
   */
  consumedModuleIds: readonly string[]
  /** A module left out for a reason of its own — the config states which. */
  isExcluded?: (recommendation: CdssRecommendation, ctx: VisitFlowContext) => boolean
  /** Rows that lead 藥物與處置 whatever their priority, in this order. */
  leadingModuleIds?: readonly string[]
  /** Which decisions each module offers, and the reasons behind them. */
  decisionRules: Readonly<Record<string, VisitDecisionRule>>
  /** The fallback for a module the rules above do not name. */
  defaultDecisionKind: (
    recommendation: CdssRecommendation,
    group: VisitActionGroupId,
  ) => VisitDecisionKind
  decisionReasons: readonly VisitDecisionReason[]
  /** The reason ids one module offers for one decision. */
  decisionReasonIds: (
    moduleId: string,
    decisionKind: VisitDecisionKind,
    decision: PhysicianDecision['decision'] | undefined,
  ) => readonly string[]
  /** A headline the disease words itself; the pack's `nextActions[0]` otherwise. */
  headline?: (recommendation: CdssRecommendation, isEnglish: boolean) => string | undefined
  /** Extra 依據 lines in front of the pack's own, for one row. */
  extraBasis?: (recommendation: CdssRecommendation, ctx: VisitFlowContext) => readonly string[]
  /** Whether a row carries the 健保 line under its basis. */
  coverageLine: boolean
  /**
   * Whether 「缺：…」 also reads `clinicalReviewItems`.
   *
   * A pack's semantic policy moves an item that needs a clinician's judgement
   * out of `missingData` into `clinicalReviewItems`. Reading both is right for
   * a pack that does that; heart failure's rows were written against
   * `missingData` alone and keep that reading.
   */
  readsClinicalReviewItems?: boolean
  /** What the record card draws. */
  recordCard: VisitRecordCardConfig
  /** Only the record's own answers; the visit's decisions are not the pack's. */
  carriedFields: (ctx: VisitFlowStepContext) => readonly CarriedField[]
  /** The plain-text summary, in the disease's own four sections. */
  summary: (ctx: VisitFlowStepContext, options: { chartLayout: boolean; isEnglish: boolean }) => string
  /** What the record already holds that bears on the first open question. */
  firstOpenHint?: (ctx: VisitFlowContext, question: VisitQuestion) => string | undefined
  /** Follow-up intervals the host derives from today's decisions. */
  followUp?: (ctx: VisitFlowStepContext) => readonly VisitFollowUpLine[]
  /** A category chip and the headline that goes with it, for one row. */
  actionCategory?: (
    row: VisitActionRow,
    isEnglish: boolean,
  ) => { label: string; headline: string } | undefined
  /** A banner above one row: heart failure's four pillars, the lipid ladder. */
  rowBanner?: (
    row: VisitActionRow,
    group: VisitActionGroup,
    isEnglish: boolean,
  ) => ReactNode
  /** Extra classes on one row's article, where a banner tints its members. */
  rowClassName?: (row: VisitActionRow, group: VisitActionGroup) => string | undefined
  /** What a dose-adjustment editor starts from when the row names no drug. */
  defaultDoseMedication?: (moduleId: string) => string | undefined
  /**
   * A note above the questions: heart failure's 「LVEF ≥50% 多一題」 line, the
   * lipid reading of 指引 and 健保表一 risk category.
   */
  questionsNote?: (args: {
    flow: VisitFlowModel
    surface: VisitFlowSurface
    isEnglish: boolean
  }) => ReactNode
  /** A second row under the record tiles: the lipid-lowering drug tiles. */
  recordSecondRow?: (args: { surface: VisitFlowSurface; isEnglish: boolean }) => ReactNode
}
