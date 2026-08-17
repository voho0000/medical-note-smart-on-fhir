import { renderHook } from '@testing-library/react'
import { useVisitStats } from '@/features/clinical-summary/visit-history/hooks/useVisitStats'

describe('useVisitStats content filters', () => {
  it('distinguishes examination reports from prescriptions', () => {
    const encounterDetails = new Map([
      ['medication-only', {
        diagnoses: [],
        tests: [],
        medications: [{}],
        reports: [],
        procedures: [],
      }],
      ['report-visit', {
        diagnoses: [],
        tests: [],
        medications: [{}],
        reports: [{}],
        procedures: [],
      }],
    ])

    const { result } = renderHook(() => useVisitStats(encounterDetails as any))

    expect(result.current.get('medication-only')?.hasReports).toBe(false)
    expect(result.current.get('report-visit')?.hasReports).toBe(true)
  })
})
