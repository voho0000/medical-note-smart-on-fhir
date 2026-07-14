import type {
  DiagnosticReportEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  MedicalSummaryResult,
  ResolvedSourceRef,
} from '@/src/core/entities/medical-summary.entity'
import { referenceId } from '@/src/core/utils/observation-selectors'
import { categorizeObservation, getTestDisplayName } from '@/src/shared/utils/lab-categories'
import {
  canonicalKeyFromLoinc,
  canonicalTestKeyFromString,
  TEST_ALIASES,
} from '@/src/shared/utils/lab-normalize'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

export interface InvestigationCumulativeTarget {
  categoryId: string
  /** Canonical cumulative-column key (CRP, HB, WBC, …) to focus after opening. */
  analyteKey?: string
  resourceType: 'DiagnosticReport' | 'Observation'
  resourceId: string
  display: string
  date?: string
}

interface CategoryCandidate {
  categoryId: string
  source: ResolvedSourceRef
}

interface AnalyteCandidate {
  categoryId: string
  analyteKey: string
  observation: ObservationEntity
}

function reportObservationIds(report: DiagnosticReportEntity): string[] {
  const ids = new Set<string>()
  for (const item of report.result ?? []) {
    const id = referenceId(item.reference)
    if (id) ids.add(id)
  }
  for (const observation of report._observations ?? []) {
    if (observation.id) ids.add(observation.id)
  }
  return [...ids]
}

const KEYWORD_SEPARATOR_RE = /[\s._\-(),]+/g

const ALIASES_BY_CANONICAL = Object.entries(TEST_ALIASES).reduce<Map<string, string[]>>(
  (aliases, [alias, canonical]) => {
    const existing = aliases.get(canonical) ?? []
    existing.push(alias)
    aliases.set(canonical, existing)
    return aliases
  },
  new Map(),
)

function normaliseKeyword(value: string): string {
  return value.normalize('NFKC').toUpperCase()
}

function isAsciiOnly(value: string): boolean {
  return !/[^\x00-\x7F]/.test(value)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Mirrors NHI-FHIR-Bridge's analyte matcher:
 * - compatibility-normalize fullwidth input;
 * - collapse common separators for equivalent spellings (M.C.V / M-C-V);
 * - require boundaries on both sides of ASCII aliases (Hb != HbA1c/HBsAg);
 * - use substring matching only for CJK aliases.
 */
function keywordMatches(alias: string, text: string): boolean {
  const key = normaliseKeyword(alias).toLowerCase()
  const combined = normaliseKeyword(text).toLowerCase()
  if (!key) return false

  if (isAsciiOnly(key)) {
    // One-letter abbreviations are too weak in an AI sentence containing
    // values and units (e.g. K/µL). Fail closed instead of guessing.
    if (key.replace(KEYWORD_SEPARATOR_RE, '').length < 2) return false
    const normalizedKey = key.replace(KEYWORD_SEPARATOR_RE, ' ').trim()
    const normalizedText = combined.replace(KEYWORD_SEPARATOR_RE, ' ')
    return new RegExp(`\\b${escapeRegex(normalizedKey)}\\b`).test(normalizedText)
  }

  return combined.includes(key)
}

function observationCanonicalAnalyte(observation: ObservationEntity): string {
  const display = getTestDisplayName(observation)
  return canonicalKeyFromLoinc(observation) ?? canonicalTestKeyFromString(display)
}

function observationAnalyteAliases(
  observation: ObservationEntity,
  canonical = observationCanonicalAnalyte(observation),
): string[] {
  const display = getTestDisplayName(observation)
  const loincCanonical = canonicalKeyFromLoinc(observation)
  const displayCanonical = canonicalTestKeyFromString(display)
  const displayAgreesWithLoinc = !loincCanonical || displayCanonical === loincCanonical

  // When a recognized LOINC exists, it defines the analyte identity. The raw
  // display participates only in the no-LOINC fallback so a contradictory
  // label cannot overrule coded data. Reverse aliases let Chinese/English AI
  // labels still match the same canonical key.
  return [...new Set([
    canonical,
    canonical.replace(/\([^)]*\)/g, ''),
    ...(ALIASES_BY_CANONICAL.get(canonical) ?? []),
    ...(displayAgreesWithLoinc ? [display] : []),
  ].map(normaliseKeyword).filter(Boolean))]
}

/**
 * Resolve each lab trend to an existing cumulative-report category without
 * guessing from its AI-written label. A target is exposed only when all cited,
 * linked observations point to one category that has dated pivot data.
 */
export function buildInvestigationCumulativeTargets(
  result: MedicalSummaryResult,
  reports: DiagnosticReportEntity[],
  observations: ObservationEntity[],
): Array<InvestigationCumulativeTarget | null> {
  const sourceByKey = new Map(result.sourceIndex.map((source) => [source.key, source]))
  const reportById = new Map(reports.map((report) => [report.id, report]))
  const observationById = new Map(
    observations.flatMap((observation) => observation.id ? [[observation.id, observation] as const] : []),
  )
  const pivots = buildLabPivots(observations)

  return result.investigations.map((item) => {
    if (item.kind !== 'lab') return null

    const candidates: CategoryCandidate[] = []
    const citedSources = item.sourceKeys
      .map((sourceKey) => sourceByKey.get(sourceKey))
      .filter((source): source is ResolvedSourceRef => Boolean(source?.verified && source.resourceId))
    if (citedSources.length === 0) return null

    for (const sourceKey of item.sourceKeys) {
      const source = sourceByKey.get(sourceKey)
      if (!source?.verified || !source.resourceId) continue

      let linkedObservations: ObservationEntity[] = []
      if (source.resourceType === 'DiagnosticReport') {
        const report = reportById.get(source.resourceId)
        if (!report) continue
        linkedObservations = reportObservationIds(report)
          .map((id) => observationById.get(id))
          .filter((observation): observation is ObservationEntity => observation !== undefined)
      } else if (source.resourceType === 'Observation') {
        const observation = observationById.get(source.resourceId)
        if (observation) linkedObservations = [observation]
      } else {
        continue
      }

      for (const observation of linkedObservations) {
        if (!observation.effectiveDateTime) continue
        const category = categorizeObservation(observation)
        if (!category) continue
        const pivot = pivots[category.id]
        if (!pivot?.dates.includes(observation.effectiveDateTime.slice(0, 10))) continue
        candidates.push({ categoryId: category.id, source })
      }
    }

    // Old cached summaries can carry an incorrect source citation even though
    // the named analyte exists in the cumulative report. Resolve exact
    // canonical analyte names (eGFR, CRP, CA-125, WBC, …) against the raw
    // observations. Matching follows the Bridge's normalization + boundary +
    // longest-match rules, while Observation identity stays LOINC-first.
    const itemText = `${item.label} ${item.trend}`
    let longestAliasLength = 0
    let analyteCandidates: AnalyteCandidate[] = []
    for (const observation of observations) {
      if (!observation.id || !observation.effectiveDateTime) continue
      const analyteKey = observationCanonicalAnalyte(observation)
      const matchingAliasLengths = observationAnalyteAliases(observation, analyteKey)
        .filter((alias) => keywordMatches(alias, itemText))
        .map((alias) => alias.length)
      const observationMatchLength = Math.max(0, ...matchingAliasLengths)
      if (observationMatchLength === 0 || observationMatchLength < longestAliasLength) continue
      const category = categorizeObservation(observation)
      if (!category) continue
      const pivot = pivots[category.id]
      if (!pivot?.dates.includes(observation.effectiveDateTime.slice(0, 10))) continue

      if (observationMatchLength > longestAliasLength) {
        longestAliasLength = observationMatchLength
        analyteCandidates = []
      }
      analyteCandidates.push({ categoryId: category.id, analyteKey, observation })
    }
    const analyteCategoryIds = [...new Set(analyteCandidates.map((candidate) => candidate.categoryId))]
    const citationCategoryIds = [...new Set(candidates.map((candidate) => candidate.categoryId))]
    const categoryId = analyteCategoryIds.length === 1
      ? analyteCategoryIds[0]
      : analyteCategoryIds.length > 1 && citationCategoryIds.length === 1
          && analyteCategoryIds.includes(citationCategoryIds[0])
        ? citationCategoryIds[0]
        : null
    if (!categoryId) return null
    const categoryAnalyteKeys = [...new Set(
      analyteCandidates
        .filter((candidate) => candidate.categoryId === categoryId)
        .map((candidate) => candidate.analyteKey),
    )]
    const analyteKey = categoryAnalyteKeys.length === 1 ? categoryAnalyteKeys[0] : undefined

    // Prefer the cited report when it agrees with the exact analyte match.
    // When citations conflict, navigate through the latest matched Observation
    // instead; the ReportsCard consumes either type before opening the panel.
    const matchingCitedSources = citationCategoryIds.length === 1 && citationCategoryIds[0] === categoryId
      ? candidates.filter((candidate) => candidate.categoryId === categoryId)
      : []
    const source = matchingCitedSources
      .map((candidate) => candidate.source)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0]

    if (source?.resourceId && (source.resourceType === 'DiagnosticReport' || source.resourceType === 'Observation')) {
      return {
        categoryId,
        ...(analyteKey ? { analyteKey } : {}),
        resourceType: source.resourceType,
        resourceId: source.resourceId,
        display: item.label,
        date: source.date,
      }
    }

    const observation = analyteCandidates
      .filter((candidate) => candidate.categoryId === categoryId)
      .map((candidate) => candidate.observation)
      .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''))[0]
    if (!observation?.id) return null

    return {
      categoryId,
      ...(analyteKey ? { analyteKey } : {}),
      resourceType: 'Observation',
      resourceId: observation.id,
      display: item.label,
      date: observation.effectiveDateTime?.slice(0, 10),
    }
  })
}
