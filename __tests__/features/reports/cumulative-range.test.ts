import {
  cumulativeRangeCutoff,
  cumulativeRangeLatestCount,
  filterDatesByCumulativeRange,
  isCumulativeRangeId,
} from '@/features/clinical-summary/reports/utils/cumulative-range.utils'

// Pivot dates arrive newest-first.
const DATES = [
  '2026-09-05',
  '2026-08-31',
  '2026-06-06',
  '2026-06-05',
  '2026-03-05',
  '2025-09-06',
  '2025-09-05',
  '2025-09-04',
  '2024-01-01',
]
const TODAY = new Date(2026, 8, 5) // 2026-09-05, local time

describe('cumulative range filtering', () => {
  it('takes the N most recent dates for the latest-N ranges', () => {
    expect(filterDatesByCumulativeRange(DATES, 'latest1', TODAY)).toEqual(['2026-09-05'])
    expect(filterDatesByCumulativeRange(DATES, 'latest3', TODAY)).toEqual([
      '2026-09-05',
      '2026-08-31',
      '2026-06-06',
    ])
    expect(cumulativeRangeLatestCount('latest3')).toBe(3)
    expect(cumulativeRangeLatestCount('year1')).toBeNull()
  })

  it('asks for more rows than the category has without padding', () => {
    expect(filterDatesByCumulativeRange(['2026-09-05'], 'latest3', TODAY))
      .toEqual(['2026-09-05'])
    expect(filterDatesByCumulativeRange([], 'latest3', TODAY)).toEqual([])
    expect(filterDatesByCumulativeRange([], 'year1', TODAY)).toEqual([])
  })

  it('keeps calendar windows inclusive of the boundary day', () => {
    expect(cumulativeRangeCutoff('months3', TODAY)).toBe('2026-06-05')
    expect(cumulativeRangeCutoff('months6', TODAY)).toBe('2026-03-05')
    expect(cumulativeRangeCutoff('year1', TODAY)).toBe('2025-09-05')
    expect(cumulativeRangeCutoff('latest3', TODAY)).toBeNull()

    // 06-05 is exactly the cutoff and stays; 03-05 (older) drops.
    expect(filterDatesByCumulativeRange(DATES, 'months3', TODAY)).toEqual([
      '2026-09-05',
      '2026-08-31',
      '2026-06-06',
      '2026-06-05',
    ])
    // The one-year window keeps 2025-09-05 (the boundary) but not 09-04.
    expect(filterDatesByCumulativeRange(DATES, 'year1', TODAY)).toEqual([
      '2026-09-05',
      '2026-08-31',
      '2026-06-06',
      '2026-06-05',
      '2026-03-05',
      '2025-09-06',
      '2025-09-05',
    ])
  })

  it('clamps a month subtraction into a shorter month instead of overflowing', () => {
    // Naive Date month arithmetic turns 2026-05-31 minus 3 months into
    // 2026-03-03, which would hide two days of results.
    expect(cumulativeRangeCutoff('months3', new Date(2026, 4, 31))).toBe('2026-02-28')
    expect(cumulativeRangeCutoff('months3', new Date(2024, 4, 31))).toBe('2024-02-29')
    // Crossing a year boundary backwards.
    expect(cumulativeRangeCutoff('months3', new Date(2026, 0, 15))).toBe('2025-10-15')
    // Leap day back one year lands on the 28th, not on March 1st.
    expect(cumulativeRangeCutoff('year1', new Date(2024, 1, 29))).toBe('2023-02-28')
  })

  it('returns an empty list when a window predates every result', () => {
    expect(filterDatesByCumulativeRange(['2020-01-01'], 'months3', TODAY)).toEqual([])
  })

  it('recognises only the shipped range ids', () => {
    expect(isCumulativeRangeId('latest3')).toBe(true)
    expect(isCumulativeRangeId('months3')).toBe(true)
    expect(isCumulativeRangeId('latest7')).toBe(false)
    expect(isCumulativeRangeId(undefined)).toBe(false)
  })
})
