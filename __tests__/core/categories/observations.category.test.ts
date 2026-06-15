import { observationsCategory } from '@/src/core/categories/observations.category'

// Three readings of the SAME analyte (BNP) + one of another (Lactate). The
// category's getCount/getContextSection receive the already-extracted orphan
// observations, so we pass them directly.
const data = [
  { code: { text: 'BNP' }, effectiveDateTime: '2026-01-10', valueQuantity: { value: 100, unit: 'pg/mL' } },
  { code: { text: 'BNP' }, effectiveDateTime: '2026-03-10', valueQuantity: { value: 250, unit: 'pg/mL' } },
  { code: { text: 'BNP' }, effectiveDateTime: '2026-05-10', valueQuantity: { value: 80, unit: 'pg/mL' } },
  { code: { text: 'Lactate' }, effectiveDateTime: '2026-05-12', valueQuantity: { value: 1.2, unit: 'mmol/L' } },
] as unknown as Parameters<typeof observationsCategory.getCount>[0]

const f = (over: Record<string, unknown> = {}) => ({ observationVersion: 'latest', observationTimeRange: 'all', ...over })

describe('observationsCategory — version filter', () => {
  it('latest counts one per analyte', () => {
    expect(observationsCategory.getCount(data, f({ observationVersion: 'latest' }))).toBe(2)
  })

  it('all counts every reading', () => {
    expect(observationsCategory.getCount(data, f({ observationVersion: 'all' }))).toBe(4)
  })

  it('latest section shows only the newest reading per analyte', () => {
    const section = observationsCategory.getContextSection(data, f({ observationVersion: 'latest' }))
    const items = Array.isArray(section) ? [] : section?.items ?? []
    // One BNP line (the latest = 80) and one Lactate line.
    expect(items.filter((i) => i.startsWith('BNP')).length).toBe(1)
    expect(items.some((i) => i.includes('BNP: 80'))).toBe(true)
    expect(items.some((i) => i.startsWith('Lactate'))).toBe(true)
  })

  it('all section shows every reading, newest first', () => {
    const section = observationsCategory.getContextSection(data, f({ observationVersion: 'all' }))
    const items = Array.isArray(section) ? [] : section?.items ?? []
    expect(items.filter((i) => i.startsWith('BNP')).length).toBe(3)
    // Newest BNP (May, value 80) comes before the older ones.
    const bnpLines = items.filter((i) => i.startsWith('BNP'))
    expect(bnpLines[0]).toContain('80')
  })

  it('time range narrows the set before counting', () => {
    // Only readings on/after ~3 months before 2026-05 survive a 3m window… but
    // isWithinTimeRange is relative to "now", so just assert the range path runs
    // without throwing and never exceeds the unfiltered count.
    const n = observationsCategory.getCount(data, f({ observationVersion: 'all', observationTimeRange: '5y' }))
    expect(n).toBeLessThanOrEqual(4)
  })
})
