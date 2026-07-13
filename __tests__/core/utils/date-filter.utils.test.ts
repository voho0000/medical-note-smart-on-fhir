import {
  resolveSinceLastVisitCutoff,
  makeTimeRangeTest,
  SINCE_LAST_VISIT,
} from '@/src/core/utils/date-filter.utils'

const enc = (start: string) => ({ period: { start } })

describe('resolveSinceLastVisitCutoff', () => {
  it('returns the previous distinct visit day (2nd most recent)', () => {
    const encounters = [enc('2026-06-01'), enc('2026-03-15'), enc('2025-01-01')]
    expect(resolveSinceLastVisitCutoff(encounters)).toBe('2026-03-15')
  })

  it('collapses same-day visits so the cutoff is a genuinely earlier day', () => {
    const encounters = [enc('2026-06-01T09:00'), enc('2026-06-01T14:00'), enc('2026-02-01')]
    expect(resolveSinceLastVisitCutoff(encounters)).toBe('2026-02-01')
  })

  it('with a single visit day, uses that day', () => {
    expect(resolveSinceLastVisitCutoff([enc('2026-06-01'), enc('2026-06-01')])).toBe('2026-06-01')
  })

  it('with no visits, returns undefined', () => {
    expect(resolveSinceLastVisitCutoff([])).toBeUndefined()
    expect(resolveSinceLastVisitCutoff(null)).toBeUndefined()
  })
})

describe('makeTimeRangeTest — sinceLastVisit', () => {
  const encounters = [enc('2026-06-01'), enc('2026-03-15'), enc('2025-01-01')]

  it('keeps data on/after the previous visit day, drops older', () => {
    const test = makeTimeRangeTest(SINCE_LAST_VISIT, { encounters })
    expect(test('2026-06-10')).toBe(true) // after latest visit
    expect(test('2026-03-15')).toBe(true) // exactly the cutoff day
    expect(test('2026-03-14')).toBe(false) // day before cutoff
    expect(test('2025-06-01')).toBe(false) // well before
  })

  it('does not claim an undated item belongs inside a bounded event window', () => {
    const test = makeTimeRangeTest(SINCE_LAST_VISIT, { encounters })
    expect(test(undefined)).toBe(false)
  })

  it('with no encounters, does not silently turn the bounded filter into all-time', () => {
    const test = makeTimeRangeTest(SINCE_LAST_VISIT, { encounters: [] })
    expect(test('2000-01-01')).toBe(false)
  })

  it('excludes future-dated data', () => {
    const test = makeTimeRangeTest(SINCE_LAST_VISIT, { encounters })
    expect(test('2999-01-01')).toBe(false)
  })

  it('falls through to wall-clock ranges for non-event values', () => {
    // 'all' always true; a bogus range defaults to true (lenient)
    expect(makeTimeRangeTest('all', { encounters })('1999-01-01')).toBe(true)
  })
})
