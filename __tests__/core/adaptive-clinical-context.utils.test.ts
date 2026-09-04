import {
  buildClinicalContextFitCandidate,
  clinicalContextTokenTarget,
  fitClinicalContextTextToTokenBudget,
  nextClinicalContextFitTier,
  MAX_PRIORITIZED_CONVERGENCE_PASSES,
  nextPrioritizedContextBudget,
  selectBestClinicalContextFitTier,
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

  it('chooses the rung that uses the most capacity, not the first one that fits', () => {
    // The measured shape of a document-heavy chart: the date-window rungs
    // collapse to one admission, while record-level prioritization fills the
    // window. Stopping at `trimmed` would discard ~85% of the usable capacity.
    expect(selectBestClinicalContextFitTier(
      { full: 125_662, trimmed: 10_657, compact: 10_126, tight: 9_549, prioritized: 95_441 },
      100_000,
    )).toBe('prioritized')
  })

  it('prefers the less reduced rung on a tie and keeps prioritized as the fallback', () => {
    expect(selectBestClinicalContextFitTier(
      { trimmed: 9_000, compact: 9_000, prioritized: 4_000 },
      10_000,
    )).toBe('trimmed')
    expect(selectBestClinicalContextFitTier({ trimmed: 40_000, prioritized: 30_000 }, 20_000))
      .toBe('prioritized')
    expect(selectBestClinicalContextFitTier({}, 20_000)).toBe('prioritized')
  })

  it('never counts the unreduced tier as a fit result', () => {
    expect(selectBestClinicalContextFitTier({ full: 900, trimmed: 400 }, 1_000)).toBe('trimmed')
  })

  it('drops low-priority sections instead of cutting required ones out of the middle', () => {
    const context = [
      "Patient Information:\n- Synthetic patient, 66 years old",
      'Problem List:\n- C22.0 Hepatocellular carcinoma\n- N18.3 Chronic kidney disease stage 3',
      'Diagnostic Reports:\n- Creatinine 2.8 mg/dL (H) 2026-08-30',
      "Patient's Allergies:\n- Contrast media — rash\n- Penicillin — anaphylaxis",
      "Patient's Medications:\n- Sorafenib 400 mg BID",
      'Procedures:\n- Central venous access assessment (2026/1/17)',
      `Documents:\n- <BEGIN_DOCUMENT id="d1">\nDocument title: Discharge summary (2026/7/9)\n${
        'Hospital course narrative. '.repeat(4_000)}\n<END_DOCUMENT id="d1">`,
      'Data Scope:\n- Retrieved 2026-09-03',
    ].join('\n\n')

    const fitted = fitClinicalContextTextToTokenBudget(context, 4_000)

    expect(estimateTokens(fitted)).toBeLessThanOrEqual(4_000)
    expect(estimateTokens(context)).toBeGreaterThan(4_000)
    for (const required of [
      'Contrast media — rash',
      'Penicillin — anaphylaxis',
      'C22.0 Hepatocellular carcinoma',
      'N18.3 Chronic kidney disease stage 3',
      'Sorafenib 400 mg BID',
    ]) {
      expect(fitted).toContain(required)
    }
    expect(fitted).toContain('omitted to fit the selected model')
    // The document body is what pays for the budget, not the safety sections.
    expect(fitted.length).toBeLessThan(context.length / 4)
  })

  it('keeps the required sections whole when only they fit', () => {
    const context = [
      "Patient's Allergies:\n- Contrast media — rash",
      `Documents:\n- <BEGIN_DOCUMENT id="d1">\nDocument title: Note\n${
        'narrative '.repeat(20_000)}\n<END_DOCUMENT id="d1">`,
    ].join('\n\n')

    const fitted = fitClinicalContextTextToTokenBudget(context, 300)

    expect(estimateTokens(fitted)).toBeLessThanOrEqual(300)
    expect(fitted).toContain('Contrast media — rash')
  })

  it('bounds an oversized tight context while retaining its beginning and end', () => {
    const text = `BEGIN-${'病歷'.repeat(30_000)}-END`
    const fitted = fitClinicalContextTextToTokenBudget(text, 2_000)

    expect(estimateTokens(fitted)).toBeLessThanOrEqual(2_000)
    expect(fitted.startsWith('BEGIN-')).toBe(true)
    expect(fitted.endsWith('-END')).toBe(true)
    expect(fitted).toContain('omitted to fit the selected model')
  })
  it('re-aims the prioritizer by the observed overshoot and stops once it fits', () => {
    // The rung that renders 103,480 against a 100,000 target is re-budgeted to
    // 100,000 × (100,000/103,480) × 0.97 ≈ 93,737, which renders inside target.
    expect(nextPrioritizedContextBudget(100_000, 103_480, 100_000, 0)).toBe(93_737)
    expect(nextPrioritizedContextBudget(93_737, 99_895, 100_000, 1)).toBeNull()
  })

  it('stops converging when a pass removed nothing', () => {
    // The residue is the required record set or the formatter's fixed
    // overhead: no smaller budget can shift it, so do not spend another pass.
    expect(nextPrioritizedContextBudget(50_000, 120_000, 100_000, 1, 120_000)).toBeNull()
    expect(nextPrioritizedContextBudget(50_000, 119_000, 100_000, 1, 120_000)).not.toBeNull()
  })

  it('bounds the number of convergence passes and ignores an unbounded target', () => {
    expect(nextPrioritizedContextBudget(
      50_000, 120_000, 100_000, MAX_PRIORITIZED_CONVERGENCE_PASSES,
    )).toBeNull()
    expect(nextPrioritizedContextBudget(50_000, 120_000, Number.POSITIVE_INFINITY, 0)).toBeNull()
  })
})
