import { shouldShowTrendPointLabel } from '@/features/clinical-summary/reports/components/CumulativeLabTrendDetail'

describe('lab trend point labels', () => {
  it('keeps abnormal values visible in a long time window', () => {
    const points = Array.from({ length: 12 }, (_, index) => ({
      abnormal: index === 4 || index === 8,
    }))

    expect(shouldShowTrendPointLabel(points, 3)).toBe(false)
    expect(shouldShowTrendPointLabel(points, 4)).toBe(true)
    expect(shouldShowTrendPointLabel(points, 8)).toBe(true)
    expect(shouldShowTrendPointLabel(points, 11)).toBe(true)
  })

  it('shows every value when the selected range contains eight points or fewer', () => {
    const points = Array.from({ length: 8 }, () => ({ abnormal: false }))

    expect(points.every((_, index) => shouldShowTrendPointLabel(points, index))).toBe(true)
  })
})
