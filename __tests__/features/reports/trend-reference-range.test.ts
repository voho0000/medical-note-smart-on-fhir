import { resolveTrendChartReferenceRange } from '@/features/clinical-summary/reports/components/CumulativeLabTrendDetail'

describe('lab trend chart reference range', () => {
  it('uses the shared range when every comparable result agrees', () => {
    const shared = { low: 13.5, high: 17.5 }

    expect(resolveTrendChartReferenceRange({
      sharedReferenceRange: shared,
      chartPoints: [],
    })).toEqual({ range: shared, source: 'shared' })
  })

  it('falls back to the latest available numeric range when history is incomplete', () => {
    expect(resolveTrendChartReferenceRange({
      sharedReferenceRange: undefined,
      chartPoints: [
        { referenceRange: { low: 12, high: 16 } },
        { referenceRange: { low: 13.5, high: 17.5 } },
        { referenceRange: undefined },
      ] as never,
    })).toEqual({
      range: { low: 13.5, high: 17.5 },
      source: 'latest',
    })
  })

  it('does not invent a green range when no numeric range exists', () => {
    expect(resolveTrendChartReferenceRange({
      sharedReferenceRange: undefined,
      chartPoints: [{ referenceRange: { text: '依報告判讀' } }] as never,
    })).toBeUndefined()
  })
})
