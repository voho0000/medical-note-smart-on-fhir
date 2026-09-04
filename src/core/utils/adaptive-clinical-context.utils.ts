import type {
  DataFilters,
  DataSelection,
  TimeRange,
} from '@/src/core/entities/clinical-context.entity'
import type { DocumentMode } from '@/src/core/utils/clinical-documents.utils'
import {
  DEFAULT_RESPONSE_RESERVE,
  formatApproxTokenCount,
  type ProtectedDocumentSummary,
} from '@/src/shared/utils/context-budget'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

export type ClinicalContextFitTier = 'full' | 'prioritized' | 'trimmed' | 'compact' | 'tight'

/** Structural counterpart of the application-layer ConsumerProfile. Keeping
 * this core utility independent of React/provider code makes it reusable in
 * tests and non-UI pipelines. */
export interface ClinicalContextProfile {
  selection: DataSelection
  filters: DataFilters
  documentMode: DocumentMode
  documentIds: string[]
}

export interface ClinicalContextFitCandidate {
  tier: ClinicalContextFitTier
  profile: ClinicalContextProfile
  /** Shared budget for the selected document bodies. Undefined means full text. */
  documentTokenBudget?: number
}

export interface ClinicalContextAdaptation {
  tier: Exclude<ClinicalContextFitTier, 'full'>
  contextLimit: number
  targetTokens: number
  originalTokens: number
  adaptedTokens: number
  protectedDocumentCount?: number
  /** Heaviest protected documents (descending), so an overflow message can name
   *  the picks worth undoing instead of only reporting a count. */
  protectedDocuments?: ProtectedDocumentSummary[]
  /** Diagnostics: how many times the record prioritizer was built before the
   *  rung settled. 1 means its first budget already rendered inside the target. */
  prioritizedPasses?: number
}

export function hasManualDocumentSelection(profile: ClinicalContextProfile): boolean {
  return profile.selection.documents && profile.documentMode === 'custom' &&
    (profile.documentIds?.length ?? 0) > 0
}

const TIME_RANGE_ORDER: TimeRange[] = [
  '24h',
  '3d',
  '1w',
  '1m',
  '3m',
  '6m',
  '1y',
  '3y',
  '5y',
  'all',
]

function capTimeRange(value: TimeRange, maximum: TimeRange): TimeRange {
  // This event-based range is already patient-specific and normally narrower
  // than a fixed wall-clock cap. Preserve it instead of guessing its width.
  if (value === 'sinceLastVisit') return value
  const valueIndex = TIME_RANGE_ORDER.indexOf(value)
  const maximumIndex = TIME_RANGE_ORDER.indexOf(maximum)
  return valueIndex <= maximumIndex ? value : maximum
}

function capLabDepth(
  value: DataFilters['labDepth'],
  maximum: 'latest' | '3' | '8',
): DataFilters['labDepth'] {
  if (maximum === 'latest') return 'latest'
  const order: DataFilters['labDepth'][] = ['latest', '3', '8', '16', 'all']
  return order.indexOf(value) <= order.indexOf(maximum) ? value : maximum
}

const MIN_REQUEST_OVERHEAD_RESERVE = 8_000
const MAX_REQUEST_OVERHEAD_RESERVE = 32_000
const REQUEST_OVERHEAD_RESERVE_FRACTION = 0.15

/**
 * Reserve a bounded amount for system instructions, output contracts and the
 * source catalog instead of limiting every model to a fixed fraction of its
 * window. Small windows keep at least 8K of headroom; larger windows reserve
 * 15%, capped at 32K so a large model can use the capacity it actually has.
 * The complete assembled request is still checked against the hard usable
 * limit immediately before generation.
 */
export function clinicalContextTokenTarget(contextLimit: number): number {
  const usable = Math.max(1, Math.round(contextLimit) - DEFAULT_RESPONSE_RESERVE)
  const requestOverheadReserve = Math.min(
    MAX_REQUEST_OVERHEAD_RESERVE,
    Math.max(
      MIN_REQUEST_OVERHEAD_RESERVE,
      Math.ceil(usable * REQUEST_OVERHEAD_RESERVE_FRACTION),
    ),
  )
  return Math.max(1, usable - requestOverheadReserve)
}

/**
 * Build a transient, progressively smaller view over the saved Data Selection
 * profile. Nothing here mutates or persists the user's profile.
 */
export function buildClinicalContextFitCandidate(
  base: ClinicalContextProfile,
  tier: ClinicalContextFitTier,
  targetTokens: number,
): ClinicalContextFitCandidate {
  const normalizedBase: ClinicalContextProfile = {
    // These are immutable provider values. Preserve their identity: copying
    // filters when only the document mode changes invalidates every lab,
    // encounter and medication memo in each mounted AI consumer.
    selection: base.selection,
    filters: base.filters,
    documentMode: base.documentMode ?? 'deduplicatedAdmissions',
    documentIds: base.documentIds ?? [],
  }
  if (tier === 'full' || tier === 'prioritized') {
    return { tier, profile: normalizedBase }
  }

  const trimmed = tier === 'trimmed'
  const compact = tier === 'compact'
  const filters: DataFilters = {
    ...normalizedBase.filters,
    // Keep the saved categories, but narrow their histories in visible,
    // deterministic steps before considering record-by-record selection.
    // Active problems remain available at every tier.
    problemListStatus: trimmed
      ? normalizedBase.filters.problemListStatus
      : 'active',
    encounterTimeRange: capTimeRange(
      normalizedBase.filters.encounterTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    medicationStatus: trimmed || compact
      ? normalizedBase.filters.medicationStatus
      : 'active',
    medicationTimeRange: capTimeRange(
      normalizedBase.filters.medicationTimeRange,
      // The tight tier keeps every currently active medication even when its
      // original order is older than three months.
      trimmed ? '1y' : compact ? '6m' : 'all',
    ),
    // Only this automatic narrowing may exempt current therapy from the
    // medication window; the user's own saved range is never overridden. Set
    // at every reduced tier (the tight tier already uses 'all', so it is a
    // no-op there and keeps the tier filters uniform).
    medicationKeepCurrentRegardlessOfRange: true,
    labDepth: capLabDepth(
      normalizedBase.filters.labDepth,
      trimmed ? '8' : compact ? '3' : 'latest',
    ),
    labReportTimeRange: capTimeRange(
      normalizedBase.filters.labReportTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    imagingReportVersion: trimmed
      ? normalizedBase.filters.imagingReportVersion
      : 'latest',
    imagingReportTimeRange: capTimeRange(
      normalizedBase.filters.imagingReportTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    vitalSignsVersion: trimmed
      ? normalizedBase.filters.vitalSignsVersion
      : 'latest',
    vitalSignsTimeRange: capTimeRange(
      normalizedBase.filters.vitalSignsTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    procedureTimeRange: capTimeRange(
      normalizedBase.filters.procedureTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    observationVersion: trimmed
      ? normalizedBase.filters.observationVersion
      : 'latest',
    observationTimeRange: capTimeRange(
      normalizedBase.filters.observationTimeRange,
      trimmed ? '1y' : compact ? '6m' : '3m',
    ),
    carePlanStatus: trimmed
      ? normalizedBase.filters.carePlanStatus
      : 'active',
  }

  return {
    tier,
    profile: {
      selection: {
        ...normalizedBase.selection,
        // Standalone observations are the lowest-signal, highest-duplication
        // category once the tight tier is required. Labs, imaging and vitals
        // remain selected independently.
        observations: trimmed || compact
          ? normalizedBase.selection.observations
          : false,
      },
      filters,
      // A bounded context includes one clinically meaningful document rather
      // than silently dropping all discharge evidence.
      documentMode: normalizedBase.documentMode === 'custom' ? 'custom' : 'latestAdmission',
      documentIds: normalizedBase.documentMode === 'custom' ? normalizedBase.documentIds : [],
    },
    // Full discharge summaries can dominate a 32k window. Keep their beginning
    // and end under a shared sub-budget; shorter notes remain untouched.
    documentTokenBudget: hasManualDocumentSelection(normalizedBase) ? undefined : Math.max(
      1,
      Math.min(
        targetTokens,
        Math.max(
          2_500,
          Math.floor(targetTokens * (trimmed ? 0.6 : compact ? 0.45 : 0.35)),
        ),
      ),
    ),
  }
}

export function nextClinicalContextFitTier(
  tier: ClinicalContextFitTier,
): ClinicalContextFitTier {
  if (tier === 'full') return 'trimmed'
  if (tier === 'trimmed') return 'compact'
  if (tier === 'compact') return 'tight'
  if (tier === 'tight') return 'prioritized'
  return 'prioritized'
}

/** Reduced rungs in ladder order; `full` is handled by its own short-circuit. */
export const REDUCED_CLINICAL_CONTEXT_FIT_TIERS: Array<
  Exclude<ClinicalContextFitTier, 'full'>
> = ['trimmed', 'compact', 'tight', 'prioritized']

/**
 * Pick the rung that uses the most of the model's capacity without exceeding
 * it, rather than the first one that happens to fit.
 *
 * The ladder is not monotone in tokens: the semantic tiers collapse documents
 * to a single admission, so `trimmed` can land an order of magnitude under the
 * target while `prioritized` — which keeps whole records by clinical priority —
 * fills it. Stopping at the first fit therefore discarded most of the evidence
 * the window could have carried. Ties resolve to the earlier (less reduced)
 * tier, and when nothing fits the record-level tier remains the fallback.
 */
export function selectBestClinicalContextFitTier(
  measuredTokens: Partial<Record<ClinicalContextFitTier, number>>,
  targetTokens: number,
): Exclude<ClinicalContextFitTier, 'full'> {
  let best: Exclude<ClinicalContextFitTier, 'full'> | null = null
  let bestTokens = -1
  for (const tier of REDUCED_CLINICAL_CONTEXT_FIT_TIERS) {
    const tokens = measuredTokens[tier]
    if (tokens === undefined || tokens > targetTokens) continue
    if (tokens > bestTokens) {
      best = tier
      bestTokens = tokens
    }
  }
  return best ?? 'prioritized'
}

/**
 * Aim slightly under the target when re-running the prioritizer, so a second
 * estimation error in the same direction does not cost another whole pass.
 */
const PRIORITIZED_CONVERGENCE_MARGIN = 0.97
/** Re-runs allowed after the first prioritized build, per fit key. */
export const MAX_PRIORITIZED_CONVERGENCE_PASSES = 3

/**
 * `prioritizeClinicalDataForTokenBudget` selects whole records against a
 * *rendered*-token budget derived from a dataset-wide estimate ratio, so its
 * rendered result can land just past the budget. Best-fit selection then
 * rejected the one rung able to fill the window and dropped the run to
 * `trimmed`, an order of magnitude smaller.
 *
 * Convergence instead re-aims the prioritizer: scale its budget by the observed
 * overshoot and rebuild. Returns the next budget to try, or `null` when another
 * pass is not warranted — the candidate already fits, the pass allowance is
 * spent, the previous pass made no progress (the residue is the required set or
 * the formatter's fixed overhead, which no smaller budget can remove), or the
 * scaled budget would not actually be smaller.
 */
export function nextPrioritizedContextBudget(
  budget: number,
  measuredTokens: number,
  targetTokens: number,
  completedPasses: number,
  previousMeasuredTokens?: number,
): number | null {
  if (!Number.isFinite(targetTokens) || measuredTokens <= targetTokens) return null
  if (completedPasses >= MAX_PRIORITIZED_CONVERGENCE_PASSES) return null
  if (previousMeasuredTokens !== undefined && measuredTokens >= previousMeasuredTokens) return null
  const scaled = Math.max(
    1,
    Math.floor(budget * (targetTokens / measuredTokens) * PRIORITIZED_CONVERGENCE_MARGIN),
  )
  return scaled < budget ? scaled : null
}

const CONTEXT_OMISSION_MARKER =
  '\n\n[... older or lower-priority clinical context omitted to fit the selected model ...]\n\n'

/**
 * Sections whose absence is a safety problem rather than a loss of detail.
 * Character-level fitting must never remove or shorten them, wherever they sit
 * in the formatted context — a 60/40 head/tail cut used to drop the allergy
 * section out of the middle even though the record prioritizer had marked
 * every allergy as required.
 */
const REQUIRED_CONTEXT_SECTION_TITLES = new Set([
  "Patient's Allergies",
  "Patient's Medications",
  'Problem List',
  'Patient Information',
  'Clinical Time Reference',
])

/** Removal order for everything else: the highest rank leaves first. */
const CONTEXT_SECTION_DROP_RANKS: Array<[RegExp, number]> = [
  [/^Documents$/, 100],
  [/^Additional Observations$/, 90],
  [/^Immunizations$/, 85],
  [/^Procedures$/, 80],
  [/^Visits & Treatment History$/, 75],
  [/^Imaging Reports$/, 70],
  [/^Diagnostic Reports/, 65],
  [/^Care Plans$/, 45],
  [/^Medical Devices$/, 40],
  [/^Advance Directives$/, 35],
  [/^Data Scope$/, 30],
  // The claims problem timeline is compact and answers "how long, where, how
  // often" for every active problem, so it leaves last of all droppables.
  [/^Problem Timeline\b/, 20],
]
/** Vital-sign panels and any future section title. */
const DEFAULT_CONTEXT_SECTION_DROP_RANK = 60

function contextSectionDropRank(title: string): number {
  for (const [pattern, rank] of CONTEXT_SECTION_DROP_RANKS) {
    if (pattern.test(title)) return rank
  }
  return DEFAULT_CONTEXT_SECTION_DROP_RANK
}

interface ParsedContextSection {
  title: string | null
  text: string
}

/**
 * Recover the section blocks `formatClinicalContext` produced (`Title:` then
 * `- item` lines, blocks separated by a blank line). Document bodies are free
 * text and may contain anything, so their `<BEGIN_DOCUMENT>`/`<END_DOCUMENT>`
 * span is never scanned for headers.
 */
function parseClinicalContextSections(text: string): ParsedContextSection[] {
  const lines = text.split('\n')
  const sections: Array<{ title: string | null; lines: string[] }> = []
  let insideDocument = false
  for (const [index, line] of lines.entries()) {
    if (/^(?:- )?<BEGIN_DOCUMENT\b/.test(line)) insideDocument = true
    const startsSection = !insideDocument
      && /^\S.*:$/.test(line)
      && (index === 0 || lines[index - 1] === '')
      && (lines[index + 1] ?? '').startsWith('- ')
    if (startsSection || sections.length === 0) {
      sections.push({ title: startsSection ? line.slice(0, -1) : null, lines: [] })
    }
    sections[sections.length - 1].lines.push(line)
    if (/^(?:- )?<END_DOCUMENT\b/.test(line)) insideDocument = false
  }
  return sections
    .map((section) => ({
      title: section.title,
      text: section.lines.join('\n').replace(/\s+$/, ''),
    }))
    .filter((section) => section.text.length > 0)
}

function assembleContextSections(
  sections: ParsedContextSection[],
  kept: Set<number>,
  replacements: Map<number, string> = new Map(),
): string {
  const parts: string[] = []
  let omitted = false
  for (const [index, section] of sections.entries()) {
    const replacement = replacements.get(index)
    if (replacement !== undefined) {
      parts.push(replacement)
      continue
    }
    if (kept.has(index)) {
      parts.push(section.text)
      continue
    }
    if (!omitted) {
      omitted = true
      parts.push(CONTEXT_OMISSION_MARKER.trim())
    }
  }
  return parts.join('\n\n')
}

/**
 * Character-level head/tail bound, used when the text has no recoverable
 * section structure and as the last resort when the required sections alone
 * still overflow.
 */
function fitTextHeadAndTail(text: string, maxTokens: number): string {
  if (!text || estimateTokens(text) <= maxTokens) return text
  const markerTokens = estimateTokens(CONTEXT_OMISSION_MARKER)
  if (maxTokens <= markerTokens) {
    let prefix = CONTEXT_OMISSION_MARKER.trim()
    while (prefix && estimateTokens(prefix) > maxTokens) {
      prefix = prefix.slice(0, Math.floor(prefix.length * 0.75))
    }
    return prefix
  }

  let low = 0
  let high = text.length
  let best = CONTEXT_OMISSION_MARKER.trim()
  while (low <= high) {
    const keptCharacters = Math.floor((low + high) / 2)
    // The opening contains patient/problems/active therapy and is slightly
    // more valuable than the tail, so retain a 60/40 split.
    const headCharacters = Math.ceil(keptCharacters * 0.6)
    const tailCharacters = keptCharacters - headCharacters
    const candidate = `${text.slice(0, headCharacters)}${CONTEXT_OMISSION_MARKER}${
      tailCharacters > 0 ? text.slice(-tailCharacters) : ''
    }`
    if (estimateTokens(candidate) <= maxTokens) {
      best = candidate
      low = keptCharacters + 1
    } else {
      high = keptCharacters - 1
    }
  }
  return best
}

/**
 * Last-resort bound after record-level prioritization has already run, used
 * only where text truncation is permitted (never for VGHBrain, which sends
 * whole records or none).
 *
 * Sections leave in reverse clinical priority — documents first, then the
 * report/visit history — so allergies, active problems and current medications
 * survive whatever the budget is. The lowest-priority section that does not
 * fit whole is then head/tail-fitted into whatever capacity is left, so a
 * small budget is still spent rather than rounded away.
 */
export function fitClinicalContextTextToTokenBudget(
  text: string,
  maxTokens: number,
): string {
  if (!text || estimateTokens(text) <= maxTokens) return text

  const sections = parseClinicalContextSections(text)
  const titled = sections.filter((section) => section.title !== null)
  // Nothing recognizable to prioritize (a single document body, a test
  // fixture): fall back to the character-level bound.
  if (titled.length < 2) return fitTextHeadAndTail(text, maxTokens)

  const kept = new Set<number>()
  const droppable: number[] = []
  for (const [index, section] of sections.entries()) {
    if (section.title === null || REQUIRED_CONTEXT_SECTION_TITLES.has(section.title)) {
      kept.add(index)
    } else {
      droppable.push(index)
    }
  }
  const requiredOnly = assembleContextSections(sections, kept)
  if (estimateTokens(requiredOnly) > maxTokens) {
    // Even the safety sections overflow. Keep the existing head/tail bound over
    // them alone rather than emitting something above the model's capacity.
    return fitTextHeadAndTail(requiredOnly, maxTokens)
  }

  droppable.sort((left, right) => (
    contextSectionDropRank(sections[left].title ?? '')
      - contextSectionDropRank(sections[right].title ?? '')
    || left - right
  ))
  const omitted: number[] = []
  for (const index of droppable) {
    kept.add(index)
    if (estimateTokens(assembleContextSections(sections, kept)) <= maxTokens) continue
    kept.delete(index)
    omitted.push(index)
  }
  let fitted = assembleContextSections(sections, kept)
  if (omitted.length === 0) return fitted

  // Spend the remaining capacity on the beginning and end of the highest
  // priority section that could not be kept whole.
  const slack = maxTokens - estimateTokens(fitted)
  const markerTokens = estimateTokens(CONTEXT_OMISSION_MARKER)
  if (slack > markerTokens * 2) {
    const partialIndex = omitted[0]
    const partial = fitTextHeadAndTail(sections[partialIndex].text, slack - markerTokens)
    const candidate = assembleContextSections(
      sections,
      kept,
      new Map([[partialIndex, partial]]),
    )
    if (estimateTokens(candidate) <= maxTokens) fitted = candidate
  }
  return fitted
}

export function formatClinicalContextAdaptationNotice(
  adaptation: ClinicalContextAdaptation,
  locale: string,
): string {
  const contextLabel = formatApproxTokenCount(adaptation.contextLimit)
  if (adaptation.protectedDocumentCount) {
    const count = adaptation.protectedDocumentCount
    return locale === 'zh-TW'
      ? `完整保留 ${count} 份自選文件，依模型 ${contextLabel} 內容視窗縮減其他資料。若仍超過容量，送出前會提示調整，不會自動排除或截短自選文件。來源索引已依保留內容重建；你儲存的資料範圍沒有變更。`
      : `Kept all ${count} manually selected documents in full and reduced other records for this model's ${contextLabel}-token window. If the input still exceeds capacity, you will be asked to adjust it before sending; selected documents will not be silently excluded or truncated. Sources reflect the retained content; your saved scope is unchanged.`
  }
  if (adaptation.tier === 'prioritized') {
    const adaptedLabel = formatApproxTokenCount(adaptation.adaptedTokens)
    return locale === 'zh-TW'
      ? `已依模型 ${contextLabel} 內容視窗，逐筆保留活動中問題、過敏、目前用藥、異常與最新檢驗及近期重要紀錄，再從最舊且低優先的資料開始縮減至約 ${adaptedLabel} tokens。來源索引已依實際保留內容重建；你儲存的資料範圍沒有變更。`
      : `For this model's ${contextLabel}-token context window, active problems, allergies, current medications, abnormal/latest tests, and recent important records were retained first; older low-priority records were then removed record by record to about ${adaptedLabel} tokens. The source index was rebuilt from the retained content, and your saved data scope was not changed.`
  }
  if (adaptation.tier === 'trimmed') {
    return locale === 'zh-TW'
      ? `已依模型 ${contextLabel} 內容視窗，暫時使用最多最近 1 年的主要病歷、每項最多 8 筆檢驗，以及最近一次出院病摘。來源索引已依實際保留內容重建；你儲存的資料範圍沒有變更。`
      : `For this model's ${contextLabel}-token context window, this run temporarily uses up to 1 year of key records, up to 8 results per lab, and the latest discharge summary. The source index was rebuilt from retained content, and your saved data scope was not changed.`
  }
  const scopeDescription = adaptation.tier === 'compact'
    ? locale === 'zh-TW'
      ? '最多最近 6 個月的主要病歷、每項最多 3 筆檢驗，以及最近一次出院病摘'
      : 'up to 6 months of key records, up to 3 results per lab, and the latest discharge summary'
    : locale === 'zh-TW'
      ? '最多最近 3 個月的主要病歷、每項最新檢驗，以及精簡後的最近一次出院病摘'
      : 'up to 3 months of key records, the latest result per lab, and a condensed latest discharge summary'
  return locale === 'zh-TW'
    ? `已依模型 ${contextLabel} 內容視窗，暫時使用${scopeDescription}。你儲存的資料範圍沒有變更。`
    : `For this model's ${contextLabel}-token context window, this run is temporarily using ${scopeDescription}. Your saved data scope was not changed.`
}
