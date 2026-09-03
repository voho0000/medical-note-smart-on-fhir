import {
  buildClinicalContextFitCandidate,
  clinicalContextTokenTarget,
  fitClinicalContextTextToTokenBudget,
  nextClinicalContextFitTier,
} from '@/src/core/utils/adaptive-clinical-context.utils'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

const fullProfile = {
  selection: { ...ALL_DATA_SELECTION },
  filters: { ...ALL_DATA_FILTERS },
  documentMode: 'all' as const,
  documentIds: ['old', 'new'],
}

describe('adaptive clinical context', () => {
  it.each(['full', 'trimmed', 'compact', 'tight', 'prioritized'] as const)('keeps custom documents complete in %s, including an empty selection', (tier) => {
    for (const documentIds of [['old', 'new'], []]) {
      const candidate = buildClinicalContextFitCandidate({ ...fullProfile, documentMode: 'custom', documentIds }, tier, 700)
      expect(candidate.profile.documentMode).toBe('custom')
      expect(candidate.profile.documentIds).toEqual(documentIds)
      if (documentIds.length) expect(candidate.documentTokenBudget).toBeUndefined()
    }
  })

  it.each(['full', 'prioritized'] as const)('preserves immutable profile field identities in the %s tier', (tier) => {
    const base = {
      ...fullProfile,
      selection: Object.freeze({ ...fullProfile.selection }),
      filters: Object.freeze({ ...fullProfile.filters }),
      documentIds: [...fullProfile.documentIds],
    }
    const candidate = buildClinicalContextFitCandidate(base, tier, 100_000)
    expect(candidate.profile.selection).toBe(base.selection)
    expect(candidate.profile.filters).toBe(base.filters)
    expect(candidate.profile.documentIds).toBe(base.documentIds)
    // Reduced tiers still create independent objects before changing fields.
    const compact = buildClinicalContextFitCandidate(base, 'compact', 100_000)
    expect(compact.profile.filters).not.toBe(base.filters)
    expect(compact.profile.selection).not.toBe(base.selection)
    expect(base.filters.labDepth).toBe('all')
  })

  it('uses bounded dynamic headroom instead of discarding a fixed window percentage', () => {
    expect(clinicalContextTokenTarget(32_768)).toBe(20_768)
    expect(clinicalContextTokenTarget(120_000)).toBe(98_600)
    expect(clinicalContextTokenTarget(262_144)).toBe(226_144)
    expect(clinicalContextTokenTarget(1_024)).toBe(1)
  })

  it('keeps a 74k clinical selection intact inside a 120k model window', () => {
    expect(74_000).toBeLessThan(clinicalContextTokenTarget(120_000))
  })

  it('builds a compact transient view without mutating the saved profile', () => {
    const candidate = buildClinicalContextFitCandidate(
      fullProfile,
      'compact',
      clinicalContextTokenTarget(32_768),
    )

    expect(candidate.profile.filters.encounterTimeRange).toBe('6m')
    expect(candidate.profile.filters.medicationTimeRange).toBe('6m')
    expect(candidate.profile.filters.labReportTimeRange).toBe('6m')
    expect(candidate.profile.filters.labDepth).toBe('3')
    expect(candidate.profile.filters.imagingReportTimeRange).toBe('6m')
    expect(candidate.profile.documentMode).toBe('latestAdmission')
    expect(candidate.profile.documentIds).toEqual([])
    expect(candidate.profile.selection.observations).toBe(true)

    expect(fullProfile.filters.encounterTimeRange).toBe('all')
    expect(fullProfile.filters.labDepth).toBe('all')
    expect(fullProfile.documentMode).toBe('all')
  })

  it('starts with a one-year / eight-result reduction before the six-month tier', () => {
    const candidate = buildClinicalContextFitCandidate(
      fullProfile,
      'trimmed',
      clinicalContextTokenTarget(262_144),
    )

    expect(candidate.profile.filters.encounterTimeRange).toBe('1y')
    expect(candidate.profile.filters.medicationStatus).toBe('all')
    expect(candidate.profile.filters.medicationTimeRange).toBe('1y')
    expect(candidate.profile.filters.labReportTimeRange).toBe('1y')
    expect(candidate.profile.filters.labDepth).toBe('8')
    expect(candidate.profile.filters.imagingReportTimeRange).toBe('1y')
    expect(candidate.profile.documentMode).toBe('latestAdmission')
  })

  it('uses a tighter three-month/latest-only fallback and drops duplicate observations', () => {
    const candidate = buildClinicalContextFitCandidate(
      fullProfile,
      'tight',
      clinicalContextTokenTarget(32_768),
    )

    expect(candidate.profile.filters.encounterTimeRange).toBe('3m')
    expect(candidate.profile.filters.medicationStatus).toBe('active')
    expect(candidate.profile.filters.medicationTimeRange).toBe('all')
    expect(candidate.profile.filters.labDepth).toBe('latest')
    expect(candidate.profile.filters.imagingReportTimeRange).toBe('3m')
    expect(candidate.profile.selection.observations).toBe(false)
  })

  it('advances through time/count reductions before record prioritization', () => {
    expect(nextClinicalContextFitTier('full')).toBe('trimmed')
    expect(nextClinicalContextFitTier('trimmed')).toBe('compact')
    expect(nextClinicalContextFitTier('compact')).toBe('tight')
    expect(nextClinicalContextFitTier('tight')).toBe('prioritized')
  })

  it('preserves a narrower saved range instead of widening it', () => {
    const candidate = buildClinicalContextFitCandidate(
      {
        ...fullProfile,
        filters: {
          ...fullProfile.filters,
          encounterTimeRange: '1m',
          labReportTimeRange: 'sinceLastVisit',
        },
      },
      'compact',
      clinicalContextTokenTarget(32_768),
    )

    expect(candidate.profile.filters.encounterTimeRange).toBe('1m')
    expect(candidate.profile.filters.labReportTimeRange).toBe('sinceLastVisit')
  })

  it('bounds an oversized tight context while retaining its beginning and end', () => {
    const text = `BEGIN-${'病歷'.repeat(30_000)}-END`
    const fitted = fitClinicalContextTextToTokenBudget(text, 2_000)

    expect(estimateTokens(fitted)).toBeLessThanOrEqual(2_000)
    expect(fitted.startsWith('BEGIN-')).toBe(true)
    expect(fitted.endsWith('-END')).toBe(true)
    expect(fitted).toContain('omitted to fit the selected model')
  })
})
