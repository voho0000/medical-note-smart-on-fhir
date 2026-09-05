/**
 * The heart-failure status board: what the module list is read through.
 *
 * A heart-failure visit asks three questions in order — can I adjust
 * foundational therapy today (the safety inputs), is anything on the
 * prescription list dangerous (the safety scan), and which of the four pillars
 * is this patient on (the gap) — and the generic module table answered all
 * three only after the reader had opened half the rows. This model pulls those
 * answers out of the pack's own output so the view can put them first.
 *
 * Nothing here is a clinical rule. Every status, title, next step, and
 * evidence value is the pack's; this file only decides which of the pack's
 * facts sit where. The one interpretation it makes — that a therapy fact
 * beginning 「目前用藥中」 means the class is being taken — reads the adapter's
 * fixed wording for that state, not the medication record.
 */
import type {
  CdssLocale,
  CdssRecommendation,
  CdssResult,
  CdssStatus,
  ClinicalEvidence,
} from '../types'
import { CLINIC_ENTRY_PATTERN } from '../utils/apply-clinic-vitals'

export const HEART_FAILURE_PACK_ID = 'heart-failure-cdss'

const PHENOTYPE_MODULE_ID = 'heart-failure-phenotype'
const FMT_SAFETY_MODULE_ID = 'heart-failure-fmt-safety'
const GDMT_MODULE_ID = 'heart-failure-hfref-gdmt'

/** The four foundational classes, in the order the guideline lists them. */
const PILLAR_MODULES = [
  { id: 'heart-failure-ras-inhibition', zh: 'ARNI／ACEI／ARB', en: 'ARNI / ACEI / ARB' },
  { id: 'heart-failure-beta-blocker', zh: '實證 β 阻斷劑', en: 'Evidence-based β-blocker' },
  { id: 'heart-failure-mra', zh: 'MRA', en: 'MRA' },
  { id: 'heart-failure-sglt2', zh: 'SGLT2i', en: 'SGLT2i' },
] as const

export type HeartFailureMetricKind = 'lab' | 'measure'

/**
 * The inputs every FMT decision reads, in the order a clinician scans them.
 * `kind` says how a missing one is obtained, which is the only thing a reader
 * can do about it.
 */
const STATUS_METRICS: readonly {
  factKey: string
  zh: string
  en: string
  kind: HeartFailureMetricKind
  /** Evidence-table rows that carry this measurement when no fact does. */
  evidenceItemIds?: readonly string[]
}[] = [
  { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
  { factKey: 'heartRate', zh: '心率', en: 'HR', kind: 'measure' },
  { factKey: 'potassium', zh: 'K', en: 'K', kind: 'lab' },
  { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
  { factKey: 'sodium', zh: 'Na', en: 'Na', kind: 'lab' },
  { factKey: 'bodyWeight', zh: '體重', en: 'Weight', kind: 'measure' },
  {
    factKey: 'NTproBNP',
    zh: 'NT-proBNP',
    en: 'NT-proBNP',
    kind: 'lab',
    evidenceItemIds: ['congestion:nt-probnp'],
  },
]

const UNIT_PATTERN = /\s*(?:mmHg|bpm|mmol\/L|mEq\/L|mL\s*\/\s*min\s*\/\s*1\.73\s*m(?:²|\^?2)|mg\/dL|pg\/mL|ng\/L|kg)(?![A-Za-z])/gi
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
  /** Entered in the room this visit rather than read from the record. */
  entered: boolean
  /** Where the value came from, for the source link. */
  evidence?: ClinicalEvidence
}

export interface HeartFailurePillar {
  id: string
  label: string
  recommendation: CdssRecommendation
  status: CdssStatus
  /** The class is being taken, read from the adapter's therapy fact. */
  taking: boolean
  /** 「Valsartan 80mg」 — the names after 「目前用藥中：」 when taking. */
  medicationNames?: string
  /** The therapy fact as written, shown when the class is not being taken. */
  therapyText?: string
  therapyDate?: string
  therapyEvidence?: ClinicalEvidence
  nextAction?: string
}

export interface HeartFailureBoardModel {
  phenotype?: CdssRecommendation
  lvef?: HeartFailureMetric
  metrics: readonly HeartFailureMetric[]
  fmtSafety?: CdssRecommendation
  /** Safety modules the pack marked actionable: read before anything else. */
  alerts: readonly CdssRecommendation[]
  gdmt?: CdssRecommendation
  pillars: readonly HeartFailurePillar[]
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

function pillarFromRecommendation(
  config: (typeof PILLAR_MODULES)[number],
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): HeartFailurePillar {
  const therapyKey = recommendation.overviewEvidenceFactKey
  const therapyEvidence = therapyKey
    ? recommendation.patientEvidence.find((item) => item.factKeys.includes(therapyKey))
    : undefined
  const therapyText = therapyEvidence?.value
  const taking = therapyText !== undefined && TAKING_PATTERN.test(therapyText)
  const medicationNames = taking
    ? therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
    : undefined
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    recommendation,
    status: recommendation.status,
    taking,
    medicationNames,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence),
    therapyEvidence,
    nextAction: recommendation.nextActions[0],
  }
}

/**
 * Reads the board out of a result. `undefined` for any pack that is not the
 * heart-failure pack, so every other pathway keeps the generic module table.
 */
export function buildHeartFailureBoard(
  result: CdssResult,
  locale: CdssLocale,
  now: Date = new Date(),
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
  const lvefEvidence = findEvidence(recommendations, 'LVEF')
  const lvef = lvefEvidence
    ? metricFromEvidence({ factKey: 'LVEF', zh: 'LVEF', en: 'LVEF', kind: 'lab' }, lvefEvidence, isEnglish, now)
    : undefined

  const metrics = STATUS_METRICS.map((config) => {
    const evidence = findEvidence(recommendations, config.factKey)
    if (evidence) return metricFromEvidence(config, evidence, isEnglish, now)
    return metricFromEvidenceTable(config, recommendations, isEnglish, now)
      ?? metricFromEvidence(config, undefined, isEnglish, now)
  })

  const alerts = recommendations.filter((item) => (
    item.domain === 'safety' && item.status === 'actionable'
  ))
  const pillars = PILLAR_MODULES.flatMap((config) => {
    const recommendation = byId.get(config.id)
    return recommendation ? [pillarFromRecommendation(config, recommendation, isEnglish)] : []
  })

  const consumedIds = new Set<string>([
    ...alerts.map((item) => item.id),
    ...pillars.map((item) => item.id),
    // The pillar heading is the GDMT module's own title, so its row would say
    // the same thing twice; it stays reachable from the heading.
    ...(pillars.length > 0 && byId.has(GDMT_MODULE_ID) ? [GDMT_MODULE_ID] : []),
  ])

  return {
    phenotype,
    lvef,
    metrics,
    fmtSafety: byId.get(FMT_SAFETY_MODULE_ID),
    alerts,
    gdmt: pillars.length > 0 ? byId.get(GDMT_MODULE_ID) : undefined,
    pillars,
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
