/**
 * The measurement cells a status board is built from, shared by the packs that
 * have one.
 *
 * A board reads the pack's own output rather than the record: a value is
 * whatever a module printed, and where no module printed one the adapter's
 * fact is read instead so the cell can say 「病歷有此值，本次無模組判定」
 * rather than 「未取得」. None of that is disease-specific, so it lives here
 * and each board names only which measurements it wants, in which order.
 *
 * Nothing here is a clinical rule. The one interpretation these helpers make —
 * that a parenthesis such as 「（已 96 天）」 marks a value past its monitoring
 * window — reads the adapter's fixed wording for that state.
 */
import type {
  CdssFact,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
} from '../types'
import { CLINIC_ENTRY_PATTERN } from '../utils/apply-clinic-vitals'

export type ClinicalMetricKind = 'lab' | 'measure'

/**
 * One measurement a board shows, and how it is found.
 *
 * `factKeys` is read in order, so a cell that stands for a family of tests —
 * 「Renin/Aldo」 is an ARR, an aldosterone, or a renin activity — names them
 * best first and shows whichever the record holds.
 */
export interface StatusMetricConfig {
  /** The cell's identity, used for its test id and as the first fact key. */
  factKey: string
  /** Extra fact keys to try, in order, when the first carries nothing. */
  factKeys?: readonly string[]
  zh: string
  en: string
  kind: ClinicalMetricKind
  /** Evidence-table rows that carry this measurement when no fact does. */
  evidenceItemIds?: readonly string[]
  /** Overrides which trailing unit is split off the value for this cell. */
  unitPattern?: RegExp
}

export interface ClinicalMetric {
  factKey: string
  label: string
  kind: ClinicalMetricKind
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
  /**
   * A pack module carried this value this visit. `false` when the record holds
   * the value but no module ran that reads it, so the cell shows the
   * measurement without a judgement behind it. The distinction matters:
   * 「未取得」 asks the clinician to order a test the laboratory already ran.
   */
  evaluated: boolean
  /** Where the value came from, for the source link. */
  evidence?: ClinicalEvidence
}

/**
 * The units a measurement prints, stripped so the cell can show the number
 * large and the unit beside its label. `%` is deliberately absent: an LVEF is
 * read as 「32%」 on the heart-failure board, and a cell that wants it split
 * off — HbA1c — says so with its own `unitPattern`.
 */
const UNIT_PATTERN = /\s*(?:mmHg|bpm|mmol\/L|mEq\/L|mL\s*\/\s*min\s*\/\s*1\.73\s*m(?:²|\^?2)|mg\/dL|mg\/g|pg\/mL|ng\/L|ng\/dL|kg)(?![A-Za-z])/gi
/** The parenthetical `agedFactEvidence` appends to a value past its window. */
export const STALE_NOTE_PATTERN = /[（(][^（()）]*(?:已 \d+ 天|\d+ d old|超過 \d+ 天窗|past the \d+-day window)[^（()）]*[）)]/
/** The adapter's fixed opening for a medication class that is being taken. */
export const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/

/**
 * The collection date the adapter prints inside the value —
 * 「142/84 mmHg（2026-04-18）」 — or, for a value entered in the room,
 * the date with its provenance note: 「142/84 mmHg（2026-09-05 門診輸入）」.
 */
const INLINE_DATE_PATTERN = /\s*[（(]\s*(\d{4}-\d{2}-\d{2})(?:[,，\s]+[^（()）]*)?[）)]/

export function latestSourceDate(evidence: ClinicalEvidence | undefined): string | undefined {
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

export function formatMetricDate(date: string | undefined, now: Date): string | undefined {
  if (!date) return undefined
  const sameYear = date.slice(0, 4) === String(now.getFullYear())
  return sameYear && date.length >= 10 ? date.slice(5, 10) : date
}

/**
 * The evidence row for one fact. Modules print the same measurement with and
 * without the stale annotation, so the annotated row wins when one exists:
 * a board must not show a value as current because the first module that
 * mentioned it happened not to date it.
 */
export function findEvidence(
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

export function compactValue(value: string, unitPattern: RegExp = UNIT_PATTERN): {
  value: string
  unit?: string
  stale: boolean
  inlineDate?: string
} {
  const stale = STALE_NOTE_PATTERN.test(value)
  const withoutNote = value.replace(STALE_NOTE_PATTERN, '').trim()
  const inlineDate = withoutNote.match(INLINE_DATE_PATTERN)?.[1]
  const withoutDate = withoutNote.replace(INLINE_DATE_PATTERN, '').trim()
  const unit = withoutDate.match(unitPattern)?.[0]?.trim()
  const compact = withoutDate.replace(unitPattern, '').replace(/\s+(?=[（(])/g, '').trim()
  return { value: compact || withoutDate, unit, stale, inlineDate }
}

/** The fact keys one cell stands for, best first. */
function keysOf(config: StatusMetricConfig): readonly string[] {
  return config.factKeys ?? [config.factKey]
}

export function metricFromEvidence(
  config: StatusMetricConfig,
  evidence: ClinicalEvidence | undefined,
  isEnglish: boolean,
  now: Date,
): ClinicalMetric {
  const label = isEnglish ? config.en : config.zh
  if (!evidence) {
    return { factKey: config.factKey, label, kind: config.kind, stale: false, entered: false, evaluated: false }
  }
  const compact = compactValue(evidence.value, config.unitPattern)
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
    evaluated: true,
    evidence,
  }
}

function metricFromEvidenceTable(
  config: StatusMetricConfig,
  recommendations: readonly CdssRecommendation[],
  isEnglish: boolean,
  now: Date,
): ClinicalMetric | undefined {
  const ids = config.evidenceItemIds ?? []
  if (ids.length === 0) return undefined
  for (const recommendation of recommendations) {
    for (const table of recommendation.evidenceTables ?? []) {
      const item = table.items.find((candidate) => ids.includes(candidate.id) && candidate.value)
      if (!item?.value) continue
      const compact = compactValue(item.value, config.unitPattern)
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
  config: StatusMetricConfig,
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
  now: Date,
): ClinicalMetric | undefined {
  for (const key of keysOf(config)) {
    const fact = facts?.[key] as CdssFact | undefined
    if (!fact) continue
    const text = isEnglish ? fact.en : fact.zh
    if (!text?.trim()) continue
    const compact = compactValue(text, config.unitPattern)
    const evidence: ClinicalEvidence = {
      label: isEnglish ? config.en : config.zh,
      value: text,
      factKeys: [key],
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
      stale: compact.stale,
      entered: CLINIC_ENTRY_PATTERN.test(text),
      evaluated: false,
      evidence,
    }
  }
  return undefined
}

/**
 * One cell, resolved the way a board reads a measurement: what a module
 * printed, then what an evidence table carried, then what the record holds,
 * then the missing state.
 */
export function buildStatusMetric(
  config: StatusMetricConfig,
  recommendations: readonly CdssRecommendation[],
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
  now: Date,
): ClinicalMetric {
  for (const key of keysOf(config)) {
    const evidence = findEvidence(recommendations, key)
    if (evidence) return metricFromEvidence(config, evidence, isEnglish, now)
  }
  return metricFromEvidenceTable(config, recommendations, isEnglish, now)
    ?? metricFromFact(config, facts, isEnglish, now)
    ?? metricFromEvidence(config, undefined, isEnglish, now)
}
