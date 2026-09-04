// A VGHBrain-style clinical cap (100K tokens for the patient context alone)
// must bound the adapted context even when the caller has no model context
// window to pass — otherwise the fitting target was Infinity, the tier ladder
// never advanced, and an oversized chart was handed to the model unchanged.
import { renderHook } from '@testing-library/react'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { VGHBRAIN_CLINICAL_TOKEN_LIMIT } from '@/src/shared/utils/vghbrain-context-policy'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'

const mockPatient = { id: 'oversized-chart-patient', gender: 'male', birthDate: '1958-03-02' }
let mockProfile: ConsumerProfile

// ~14k characters per note × 40 notes ≈ 560k characters ≈ 140k estimated
// tokens at the `full` tier, comfortably past the 100,000-token clinical cap.
const mockData = {
  isLoading: false,
  isFetching: false,
  error: null,
  compositions: Array.from({ length: 40 }, (_, i) => ({
    id: `document-${i}`,
    date: `2026-08-${String(40 - i).padStart(2, '0')}`,
    title: 'Discharge summary',
    type: { coding: [{ code: '18842-5' }] },
    section: [{ text: { div: `<div>Document ${i}: ${'Synthetic clinical finding. '.repeat(500)}</div>` } }],
  })),
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => ({ patient: mockPatient }) }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockData }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({ getProfile: () => mockProfile }) }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW' }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => Date.parse('2026-09-03') }))

describe('useClinicalAiInput clinical cap without a model context window', () => {
  beforeEach(() => {
    ensureCategoriesInitialized()
    mockProfile = {
      selection: { ...ALL_DATA_SELECTION, documents: true },
      filters: { ...ALL_DATA_FILTERS },
      documentMode: 'all',
      documentIds: [],
    }
  })

  it('leaves an unbounded caller unbounded', () => {
    const { result } = renderHook(() => useClinicalAiInput(undefined, 'insights', 1, false))

    expect(result.current.contextAdaptation).toBeNull()
    expect(estimateTokens(result.current.clinicalContext))
      .toBeGreaterThan(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
  })

  it.each([undefined, 0])('applies the 100K clinical cap with contextLimit %s', (contextLimit) => {
    const { result } = renderHook(() => useClinicalAiInput(
      contextLimit,
      'insights',
      1,
      false,
      VGHBRAIN_CLINICAL_TOKEN_LIMIT,
    ))

    const adaptation = result.current.contextAdaptation
    expect(adaptation).not.toBeNull()
    expect(adaptation!.targetTokens).toBe(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
    expect(adaptation!.tier).not.toBe('full')
    expect(adaptation!.originalTokens).toBeGreaterThan(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
    expect(result.current.dataReady).toBe(true)
    expect(estimateTokens(result.current.clinicalContext))
      .toBeLessThanOrEqual(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
  })

  it('uses the rung that fills the cap rather than the first rung that fits', () => {
    const { result } = renderHook(() => useClinicalAiInput(
      undefined,
      'insights',
      1,
      false,
      VGHBRAIN_CLINICAL_TOKEN_LIMIT,
    ))

    const adaptation = result.current.contextAdaptation!
    // `trimmed` fits this chart at ~4k tokens (one admission); record-level
    // prioritization keeps most of the 40 discharge summaries instead.
    expect(adaptation.tier).toBe('prioritized')
    expect(adaptation.adaptedTokens).toBeGreaterThan(VGHBRAIN_CLINICAL_TOKEN_LIMIT * 0.7)
    expect(adaptation.adaptedTokens).toBeLessThanOrEqual(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
    const retainedDocuments = result.current.clinicalContext.match(/Document title:/g) ?? []
    expect(retainedDocuments.length).toBeGreaterThan(20)
  })
})
