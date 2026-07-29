import {
  buildClinicalContextFitCandidate,
  clinicalContextTokenTarget,
  fitClinicalContextTextToTokenBudget,
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
  it('leaves prompt/schema headroom inside a 32k model window', () => {
    const target = clinicalContextTokenTarget(32_768)
    expect(target).toBeLessThan(20_000)
    expect(target).toBeGreaterThan(12_000)
    expect(clinicalContextTokenTarget(1_024)).toBe(1)
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

  it('uses a tighter three-month/latest-only fallback and drops duplicate observations', () => {
    const candidate = buildClinicalContextFitCandidate(
      fullProfile,
      'tight',
      clinicalContextTokenTarget(32_768),
    )

    expect(candidate.profile.filters.encounterTimeRange).toBe('3m')
    expect(candidate.profile.filters.medicationTimeRange).toBe('3m')
    expect(candidate.profile.filters.labDepth).toBe('latest')
    expect(candidate.profile.filters.imagingReportTimeRange).toBe('3m')
    expect(candidate.profile.selection.observations).toBe(false)
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
