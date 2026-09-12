/** Shared presentation model. Clinical judgements remain in the care pack. */
import type { CdssFact, CdssLocale, CdssPatientProfile, CdssRecommendation, CdssResult, CdssStatus, ClinicalEvidence } from '../types'
import { CLINIC_ENTRY_PATTERN } from '../utils/apply-clinic-vitals'

export type DiseaseMetricKind = 'lab' | 'measure'
export interface BoardMetricConfig {
  factKey: string
  zh: string
  en: string
  kind: DiseaseMetricKind
  evidenceItemIds?: readonly string[]
}
export interface DiseaseBoardConfig {
  packId: string
  headlineModuleId: string
  metrics: readonly BoardMetricConfig[]
}
const UNIT_PATTERN = /\s*(?:mmHg|bpm|mmol\/L|mEq\/L|mL\s*\/\s*min\s*\/\s*1\.73\s*m(?:²|\^?2)|mg\/dL|pg\/mL|ng\/L|kg)(?![A-Za-z])/gi
/** The parenthetical `agedFactEvidence` appends to a value past its window. */
const STALE_NOTE_PATTERN = /[（(][^（()）]*(?:已 \d+ 天|\d+ d old|超過 \d+ 天窗|past the \d+-day window)[^（()）]*[）)]/
export const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/

export interface DiseaseMetric {
  factKey: string
  label: string
  kind: DiseaseMetricKind
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

/**
 * The evidence row for one fact. Modules print the same measurement with and
 * without the stale annotation, so the annotated row wins when one exists:
 * the board must not show a value as current because the first module that
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

/**
 * The collection date the adapter prints inside the value —
 * 「142/84 mmHg（2026-04-18）」 — or, for a value entered in the room,
 * the date with its provenance note: 「142/84 mmHg（2026-09-05 門診輸入）」.
 */
const INLINE_DATE_PATTERN = /\s*[（(]\s*(\d{4}-\d{2}-\d{2})(?:[,，\s]+[^（()）]*)?[）)]/

export function compactValue(value: string): {
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

export function metricFromEvidence(
  config: BoardMetricConfig,
  evidence: ClinicalEvidence | undefined,
  isEnglish: boolean,
  now: Date,
): DiseaseMetric {
  const label = isEnglish ? config.en : config.zh
  if (!evidence) {
    return { factKey: config.factKey, label, kind: config.kind, stale: false, entered: false, evaluated: false }
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
    evaluated: true,
    evidence,
  }
}

export function metricFromEvidenceTable(
  config: BoardMetricConfig,
  recommendations: readonly CdssRecommendation[],
  isEnglish: boolean,
  now: Date,
): DiseaseMetric | undefined {
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
export function metricFromFact(
  config: BoardMetricConfig,
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
  now: Date,
): DiseaseMetric | undefined {
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
    stale: compact.stale,
    entered: CLINIC_ENTRY_PATTERN.test(text),
    evaluated: false,
    evidence,
  }
}


export function buildDiseaseBoard(
  result: CdssResult, config: DiseaseBoardConfig, locale: CdssLocale,
  now: Date, profileFacts?: CdssPatientProfile['facts'],
) {
  if (result.packId !== config.packId) return undefined
  const recommendations = [...new Map([
    ...result.recommendations,
    ...(result.automatedChecks ?? []).flatMap(check => check.recommendation ? [check.recommendation] : []),
  ].map(item => [item.id, item])).values()]
  const byId = new Map(recommendations.map(item => [item.id, item]))
  const metrics = config.metrics.map(metric => {
    const found = findEvidence(recommendations, metric.factKey)
    if (found) return metricFromEvidence(metric, found, locale === 'en', now)
    return metricFromEvidenceTable(metric, recommendations, locale === 'en', now)
      ?? metricFromFact(metric, profileFacts, locale === 'en', now)
      ?? metricFromEvidence(metric, undefined, locale === 'en', now)
  })
  const alerts = recommendations.filter(item => item.domain === 'safety' && item.status === 'actionable')
  const statusCounts: Record<CdssStatus, number> = { actionable: 0, 'needs-data': 0, review: 0, 'no-action': 0 }
  recommendations.forEach(item => { statusCounts[item.status] += 1 })
  return { recommendations, byId, headline: byId.get(config.headlineModuleId), metrics, alerts, statusCounts }
}
