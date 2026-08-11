import type {
  DataFilters,
  DataSelection,
  TimeRange,
} from '@/src/core/entities/clinical-context.entity'
import type { DocumentMode } from '@/src/core/utils/clinical-documents.utils'
import {
  DEFAULT_RESPONSE_RESERVE,
  formatApproxTokenCount,
} from '@/src/shared/utils/context-budget'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

export type ClinicalContextFitTier = 'full' | 'compact' | 'tight'

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
  maximum: 'latest' | '3',
): DataFilters['labDepth'] {
  if (maximum === 'latest') return 'latest'
  return value === 'latest' || value === '3' ? value : '3'
}

/**
 * Keep selected clinical text well below the raw input ceiling. The remaining
 * space is intentionally substantial: structured summary requests also carry
 * the source catalog, longitudinal evidence, safety rules, JSON contracts and
 * language instructions.
 */
export function clinicalContextTokenTarget(contextLimit: number): number {
  const usable = Math.max(1, Math.round(contextLimit) - DEFAULT_RESPONSE_RESERVE)
  return Math.max(1, Math.floor(usable * 0.55))
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
    selection: { ...base.selection },
    filters: { ...base.filters },
    documentMode: base.documentMode ?? 'latestAdmission',
    documentIds: [...(base.documentIds ?? [])],
  }
  if (tier === 'full') return { tier, profile: normalizedBase }

  const compact = tier === 'compact'
  const filters: DataFilters = {
    ...normalizedBase.filters,
    problemListStatus: 'active',
    encounterTimeRange: capTimeRange(
      normalizedBase.filters.encounterTimeRange,
      compact ? '6m' : '3m',
    ),
    medicationStatus: 'active',
    medicationTimeRange: capTimeRange(
      normalizedBase.filters.medicationTimeRange,
      compact ? '6m' : '3m',
    ),
    labDepth: capLabDepth(
      normalizedBase.filters.labDepth,
      compact ? '3' : 'latest',
    ),
    labReportTimeRange: capTimeRange(
      normalizedBase.filters.labReportTimeRange,
      compact ? '6m' : '3m',
    ),
    imagingReportVersion: 'latest',
    imagingReportTimeRange: capTimeRange(
      normalizedBase.filters.imagingReportTimeRange,
      compact ? '6m' : '3m',
    ),
    vitalSignsVersion: 'latest',
    vitalSignsTimeRange: capTimeRange(
      normalizedBase.filters.vitalSignsTimeRange,
      compact ? '1y' : '6m',
    ),
    procedureTimeRange: capTimeRange(
      normalizedBase.filters.procedureTimeRange,
      compact ? '1y' : '6m',
    ),
    observationVersion: 'latest',
    observationTimeRange: capTimeRange(
      normalizedBase.filters.observationTimeRange,
      compact ? '6m' : '3m',
    ),
    carePlanStatus: 'active',
  }

  return {
    tier,
    profile: {
      selection: {
        ...normalizedBase.selection,
        // Standalone observations are the lowest-signal, highest-duplication
        // category once the tight tier is required. Labs, imaging and vitals
        // remain selected independently.
        observations: compact ? normalizedBase.selection.observations : false,
      },
      filters,
      // A bounded context includes one clinically meaningful document rather
      // than silently dropping all discharge evidence.
      documentMode: 'latestAdmission',
      documentIds: [],
    },
    // Full discharge summaries can dominate a 32k window. Keep their beginning
    // and end under a shared sub-budget; shorter notes remain untouched.
    documentTokenBudget: Math.max(
      1,
      Math.min(
        targetTokens,
        Math.max(
          2_500,
          Math.floor(targetTokens * (compact ? 0.45 : 0.35)),
        ),
      ),
    ),
  }
}

export function nextClinicalContextFitTier(
  tier: ClinicalContextFitTier,
): ClinicalContextFitTier {
  if (tier === 'full') return 'compact'
  return 'tight'
}

const CONTEXT_OMISSION_MARKER =
  '\n\n[... older or lower-priority clinical context omitted to fit the selected model ...]\n\n'

/**
 * Last-resort bound after semantic filtering has reached the tight tier.
 * Preserve both the high-priority opening sections and the newest coverage /
 * document tail rather than relying on a provider to truncate the request at
 * an arbitrary byte boundary.
 */
export function fitClinicalContextTextToTokenBudget(
  text: string,
  maxTokens: number,
): string {
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

export function formatClinicalContextAdaptationNotice(
  adaptation: ClinicalContextAdaptation,
  locale: string,
): string {
  const contextLabel = formatApproxTokenCount(adaptation.contextLimit)
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
