import { renderHook } from '@testing-library/react'
import { useObservationHistory } from '@/features/clinical-summary/reports/hooks/useObservationHistory'

const mockUseClinicalData = jest.fn()

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

describe('useObservationHistory nested-result fallback', () => {
  beforeEach(() => {
    mockUseClinicalData.mockReturnValue({
      observations: [],
      diagnosticReports: [],
      procedures: [],
    })
  })

  it('keeps the selected nested text result in history', () => {
    const selected = {
      id: 'nested-culture',
      status: 'final',
      code: { text: 'Aerobic Culture' },
      effectiveDateTime: '2026-08-12',
      valueString: 'No growth',
    }

    const { result } = renderHook(() => (
      useObservationHistory('Aerobic Culture', selected)
    ))

    expect(result.current).toEqual([
      expect.objectContaining({
        id: 'nested-culture',
        value: 'No growth',
        date: '2026-08-12',
      }),
    ])
  })

  it('preserves coded qualitative values in history', () => {
    const selected = {
      id: 'nested-coded',
      status: 'final',
      code: { text: 'Culture Result' },
      effectiveDateTime: '2026-08-13',
      valueCodeableConcept: { text: 'Positive' },
    }

    const { result } = renderHook(() => (
      useObservationHistory('Culture Result', selected)
    ))

    expect(result.current[0]?.value).toBe('Positive')
  })
})
