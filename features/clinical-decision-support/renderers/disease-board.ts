/**
 * The status board, as a shape one disease at a time can be described in.
 *
 * A board is the host's reading order for one pack's output: the numbers every
 * decision reads, then what the pack marked dangerous, then the treatment
 * tracks, then everything else ranked by what the clinician has to do. Heart
 * failure was the first; dyslipidemia is the second, and the second is the one
 * that turns hard-coded module ids into a `DiseaseBoardConfig`.
 *
 * Nothing here is a clinical rule. Every status, title, next step, evidence
 * value and coverage sentence is printed as the pack wrote it; this file only
 * decides which of the pack's own facts sit where. Two readings of fixed
 * adapter wording are made and they are stated as such: a therapy fact starting
 * 「目前用藥中」 means the class is taken, and an allergy fact starting
 * 「已記載」 means one is documented. Both are the adapter's own constants, not
 * an inference about the medication record.
 */
import type {
  CdssFact,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  CdssResult,
  CdssSourceAssessmentStatus,
  CdssStatus,
  ClinicalEvidence,
} from '../types'
import { CLINIC_ENTRY_PATTERN } from '../utils/apply-clinic-vitals'

/**
 * How a missing input is obtained: ordered from the lab, measured in the room,
 * or computed from two values already on the panel (non-HDL-C).
 */
export type BoardMetricKind = 'lab' | 'measure' | 'derived'

/** The clinic-entry fields a board's measurement form may offer. */
export type BoardClinicEntryField = 'systolic' | 'diastolic' | 'heartRate' | 'bodyWeight'

export interface BoardText {
  zh: string
  en: string
}

export interface BoardMetricConfig {
  factKey: string
  zh: string
  en: string
  kind: BoardMetricKind
  /** Evidence-table rows that carry this measurement when no fact does. */
  evidenceItemIds?: readonly string[]
}

export interface BoardPillarConfig {
  /**
   * Shape (a): the pack's module id for this pillar.
   * Shape (b): the therapy fact key whose evidence row is this pillar.
   */
  id: string
  zh: string
  en: string
  /**
   * Shape (a) only: the adapter's therapy facts, read when the pack produced
   * no module for this pillar.
   */
  therapyFactKeys?: readonly string[]
  /**
   * Shape (b) only: a second evidence row shown on the tile when the record
   * holds one — the statin allergy line on the statin tile.
   */
  noteFactKey?: string
}

export type BoardPillarsConfig =
  /** One module per pillar; each names its therapy fact. Heart failure. */
  | {
    shape: 'module'
    modules: readonly BoardPillarConfig[]
    /** The module whose title and status head the section. */
    headingModuleId?: string
  }
  /** One module listing several therapy rows. Dyslipidemia. */
  | {
    shape: 'row'
    moduleId: string
    rows: readonly BoardPillarConfig[]
    /**
     * Draw the rows as a sequence — tiles in the config's order with a
     * connector between them — rather than as equal tracks. Default `false`,
     * so a row board that says nothing about order keeps the plain grid.
     * The order itself is the config's; no word about when a step is taken
     * is added here, because those words are the pack's.
     */
    sequence?: boolean
  }

export interface DiseaseBoardConfig {
  packId: string
  /** Test ids and detail region ids are namespaced with this. */
  testIdPrefix: string
  /** The module whose title states the phenotype, stage, or risk category. */
  headlineModuleId: string
  /** The one fact that frames it: LVEF, LDL-C. */
  headlineFactKey: string
  headlineKind: BoardMetricKind
  /** How the big number is labelled, and the heading above it. */
  headlineLabel: BoardText
  headlineHeading: BoardText
  /** What produced the number, printed with its date. HF: 「心超」. */
  headlineSourceLabel?: BoardText
  /** The inputs the pack's decisions read, in the order a clinician scans them. */
  metrics: readonly BoardMetricConfig[]
  metricColumnsClass: string
  pillars: BoardPillarsConfig
  pillarSectionLabel: BoardText
  pillarSectionKicker: BoardText
  pillarFallbackTitle: BoardText
  /** A module printed as one line under the inputs. HF: FMT safety. */
  footerModuleId?: string
  /**
   * Whether the pack's 健保給付 assessment is surfaced on the headline and the
   * pillar heading. The pack writes the sentence; the board only places it.
   */
  showCoverage: boolean
  /** Empty when this board takes no measurements in the room. */
  clinicEntryFields: readonly BoardClinicEntryField[]
}

export interface BoardMetric {
  factKey: string
  label: string
  kind: BoardMetricKind
  /** The measurement without its unit or stale note; undefined when absent. */
  value?: string
  /** The evidence value as the pack wrote it, for the tooltip. */
  fullValue?: string
  unit?: string
  date?: string
  ageDays?: number
  /** The pack marked the value as past its monitoring window. */
  stale: boolean
  /** Entered in the room this visit rather than read from the record. */
  entered: boolean
  /** Where the value came from, for the source link. */
  evidence?: ClinicalEvidence
}

export interface BoardPillar {
  id: string
  label: string
  /**
   * The pack's module for this pillar. Shape (a) only, and absent when the
   * pack did not evaluate it; the tile then shows the therapy fact alone.
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
  nextAction?: string
  /** A documented allergy or intolerance for this class, as the pack wrote it. */
  note?: string
}

/**
 * The pack's own coverage verdict for one card. Printed, never recomputed: the
 * status is the pack's, the sentence is the pack's, and the board decides only
 * that the first sentence is the one that fits on a heading.
 */
export interface BoardCoverage {
  status: CdssSourceAssessmentStatus
  sourceLabel: string
  version: string
  summary: string
  firstSentence: string
}

export interface DiseaseBoardModel {
  config: DiseaseBoardConfig
  /** The module that states the phenotype or risk category. */
  headline?: CdssRecommendation
  headlineMetric?: BoardMetric
  headlineCoverage?: BoardCoverage
  metrics: readonly BoardMetric[]
  footer?: CdssRecommendation
  /** Safety modules the pack marked actionable: read before anything else. */
  alerts: readonly CdssRecommendation[]
  /** The module whose title, status and next step head the pillar section. */
  pillarHeading?: CdssRecommendation
  pillarCoverage?: BoardCoverage
  pillars: readonly BoardPillar[]
  /** Module ids the board renders itself, so the list does not repeat them. */
  consumedIds: ReadonlySet<string>
}

const UNIT_PATTERN = /\s*(?:mmHg|bpm|mmol\/L|mEq\/L|mL\s*\/\s*min\s*\/\s*1\.73\s*m(?:²|\^?2)|mg\/dL|nmol\/L|pg\/mL|ng\/L|kg)(?![A-Za-z])/gi
/** The parenthetical `agedFactEvidence` appends to a value past its window. */
const STALE_NOTE_PATTERN = /[（(][^（()）]*(?:已 \d+ 天|\d+ d old|超過 \d+ 天窗|past the \d+-day window)[^（()）]*[）)]/
/** The adapter's fixed wording for a class the patient is taking. */
const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/
/** The adapter's fixed wording for a documented allergy or intolerance. */
const DOCUMENTED_ALLERGY_PATTERN = /^(?:已記載|Documented )/
/**
 * The collection date the adapter prints inside the value —
 * 「142/84 mmHg（2026-04-18）」 — or, for a value entered in the room,
 * the date with its provenance note: 「142/84 mmHg（2026-09-05 門診輸入）」.
 */
const INLINE_DATE_PATTERN = /\s*[（(]\s*(\d{4}-\d{2}-\d{2})(?:[,，\s]+[^（()）]*)?[）)]/

function latestSourceDate(evidence: ClinicalEvidence | undefined): string | undefined {
  const dates = (evidence?.sources ?? [])
    .map((source) => source.date)
    .filter((date): date is string => Boolean(date))
    .sort()
  return dates.at(-1)
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
  config: BoardMetricConfig,
  evidence: ClinicalEvidence | undefined,
  isEnglish: boolean,
  now: Date,
): BoardMetric {
  const label = isEnglish ? config.en : config.zh
  if (!evidence) {
    return { factKey: config.factKey, label, kind: config.kind, stale: false, entered: false }
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
    evidence,
  }
}

function metricFromEvidenceTable(
  config: BoardMetricConfig,
  recommendations: readonly CdssRecommendation[],
  isEnglish: boolean,
  now: Date,
): BoardMetric | undefined {
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

function medicationNamesFrom(therapyText: string): string | undefined {
  return therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
}

function pillarFromRecommendation(
  config: BoardPillarConfig,
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): BoardPillar {
  const therapyKey = recommendation.overviewEvidenceFactKey
  const therapyEvidence = therapyKey
    ? recommendation.patientEvidence.find((item) => item.factKeys.includes(therapyKey))
    : undefined
  const therapyText = therapyEvidence?.value
  const taking = therapyText !== undefined && TAKING_PATTERN.test(therapyText)
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    recommendation,
    status: recommendation.status,
    evaluated: true,
    taking,
    medicationNames: taking && therapyText ? medicationNamesFrom(therapyText) : undefined,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence),
    therapyEvidence,
    nextAction: recommendation.nextActions[0],
  }
}

/**
 * A pillar the pack did not evaluate, read from the adapter's therapy facts.
 * For a pillar with two classes (ARNI or ACEI/ARB) the class being taken
 * wins; otherwise the first fact the record holds.
 */
function pillarFromFacts(
  config: BoardPillarConfig,
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
): BoardPillar | undefined {
  if (!facts) return undefined
  const candidates = (config.therapyFactKeys ?? [])
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
    medicationNames: taking ? medicationNamesFrom(therapyText) : undefined,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence) ?? chosen.fact.date,
    therapyEvidence,
  }
}

/**
 * One therapy row of a module that lists several — the dyslipidemia shape.
 * The row is not a module: it carries no status and no next step of its own,
 * because the pack wrote one judgement for the whole reconciliation. The tile
 * label is the pack's own label for the row; the config's is the fallback for
 * a class the record holds nothing about.
 */
function pillarFromEvidenceRow(
  config: BoardPillarConfig,
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): BoardPillar {
  const therapyEvidence = recommendation.patientEvidence.find(
    (item) => item.factKeys.includes(config.id),
  )
  const therapyText = therapyEvidence?.value
  const taking = therapyText !== undefined && TAKING_PATTERN.test(therapyText)
  const noteEvidence = config.noteFactKey
    ? recommendation.patientEvidence.find((item) => item.factKeys.includes(config.noteFactKey!))
    : undefined
  const note = noteEvidence && DOCUMENTED_ALLERGY_PATTERN.test(noteEvidence.value)
    ? noteEvidence.value
    : undefined
  return {
    id: config.id,
    label: therapyEvidence?.label ?? (isEnglish ? config.en : config.zh),
    recommendation,
    evaluated: true,
    taking,
    medicationNames: taking && therapyText ? medicationNamesFrom(therapyText) : undefined,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence),
    therapyEvidence,
    note,
  }
}

/** 「…落在表一條件內；目標 <70 mg/dL。」 — the sentence a heading has room for. */
function firstSentence(text: string): string {
  const full = text.trim()
  const zhEnd = full.indexOf('。')
  if (zhEnd >= 0) return full.slice(0, zhEnd + 1)
  const enEnd = full.match(/^[\s\S]*?\.(?=\s|$)/)
  return enEnd ? enEnd[0] : full
}

/**
 * The pack's 健保給付 line for one card.
 *
 * The one card the coverage line has nothing to say about is the one the
 * detail view already drops: a `not-applicable` verdict on a card that is not
 * about a medication. Same rule, same place, so the board and the opened card
 * never disagree about whether there is a coverage line at all.
 */
function coverageOf(recommendation: CdssRecommendation | undefined): BoardCoverage | undefined {
  const source = (recommendation?.sourceAssessments ?? []).find(
    (item) => item.sourceKind === 'coverage',
  )
  if (!source || !recommendation) return undefined
  if (recommendation.domain !== 'medication' && source.status === 'not-applicable') return undefined
  if (source.summary.trim().length === 0) return undefined
  return {
    status: source.status,
    sourceLabel: source.sourceLabel,
    version: source.version,
    summary: source.summary,
    firstSentence: firstSentence(source.summary),
  }
}

/**
 * Reads a board out of a result. `undefined` for any pack the config was not
 * written for, so every other pathway keeps the generic module table.
 */
export function buildDiseaseBoard(
  result: CdssResult,
  config: DiseaseBoardConfig,
  locale: CdssLocale,
  now: Date = new Date(),
  /** The profile the pack read, for pillars the pack produced no module for. */
  profileFacts?: CdssPatientProfile['facts'],
): DiseaseBoardModel | undefined {
  if (result.packId !== config.packId) return undefined
  const isEnglish = locale === 'en'
  // A module the pack finished with is reported as an automated check, not as
  // a recommendation, and a board that read only the recommendations would
  // lose the headline the moment the patient reached the goal.
  const recommendations = [
    ...result.recommendations,
    ...(result.automatedChecks ?? [])
      .map((check) => check.recommendation)
      .filter((item): item is CdssRecommendation => Boolean(item)),
  ]
  const byId = new Map(recommendations.map((item) => [item.id, item]))

  const headline = byId.get(config.headlineModuleId)
  const headlineEvidence = findEvidence(recommendations, config.headlineFactKey)
  const headlineMetric = headlineEvidence
    ? metricFromEvidence(
      {
        factKey: config.headlineFactKey,
        zh: config.headlineLabel.zh,
        en: config.headlineLabel.en,
        kind: config.headlineKind,
      },
      headlineEvidence,
      isEnglish,
      now,
    )
    : undefined

  const metrics = config.metrics.map((metric) => {
    const evidence = findEvidence(recommendations, metric.factKey)
    if (evidence) return metricFromEvidence(metric, evidence, isEnglish, now)
    return metricFromEvidenceTable(metric, recommendations, isEnglish, now)
      ?? metricFromEvidence(metric, undefined, isEnglish, now)
  })

  const alerts = recommendations.filter((item) => (
    item.domain === 'safety' && (item.status === 'actionable' || item.status === 'review')
  ))

  const pillars = config.pillars.shape === 'module'
    ? config.pillars.modules.flatMap((pillarConfig) => {
      const recommendation = byId.get(pillarConfig.id)
      const pillar = recommendation
        ? pillarFromRecommendation(pillarConfig, recommendation, isEnglish)
        : pillarFromFacts(pillarConfig, profileFacts, isEnglish)
      return pillar ? [pillar] : []
    })
    : (() => {
      const therapyModule = byId.get(config.pillars.moduleId)
      if (!therapyModule) return []
      return config.pillars.rows.map(
        (row) => pillarFromEvidenceRow(row, therapyModule, isEnglish),
      )
    })()

  const evaluatedPillars = pillars.filter((pillar) => pillar.evaluated)
  const headingModuleId = config.pillars.shape === 'module'
    ? config.pillars.headingModuleId
    : config.pillars.moduleId
  // The heading is the module's own title, so a row in the list below would
  // say the same thing twice; it stays reachable from the heading itself.
  const pillarHeading = evaluatedPillars.length > 0 && headingModuleId
    ? byId.get(headingModuleId)
    : undefined

  const consumedIds = new Set<string>([
    ...alerts.map((item) => item.id),
    ...(config.pillars.shape === 'module' ? pillars.map((item) => item.id) : []),
    ...(pillarHeading ? [pillarHeading.id] : []),
  ])

  return {
    config,
    headline,
    headlineMetric,
    headlineCoverage: config.showCoverage ? coverageOf(headline) : undefined,
    metrics,
    footer: config.footerModuleId ? byId.get(config.footerModuleId) : undefined,
    alerts,
    pillarHeading,
    pillarCoverage: config.showCoverage ? coverageOf(pillarHeading) : undefined,
    pillars,
    consumedIds,
  }
}

/**
 * The reading order for what a board did not consume: what to do, then
 * what to fetch, then what to judge, then what is done. Status carries the
 * order; priority breaks ties; the pack's own module order settles the rest.
 */
export const BOARD_LIST_STATUS_ORDER: readonly CdssStatus[] = [
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
