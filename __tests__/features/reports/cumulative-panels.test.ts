import { splitPivotIntoStackedPanels } from '@/features/clinical-summary/reports/utils/cumulative-panels.utils'
import { LAB_CATEGORIES } from '@/src/shared/utils/lab-categories'
import type { LabPivot, LabRow } from '@/src/shared/utils/lab-pivot.utils'

const chem = LAB_CATEGORIES.find((category) => category.id === 'chem')!
const cbc = LAB_CATEGORIES.find((category) => category.id === 'cbc')!

function row(testKey: string, subgroupId: string | undefined, valuesByDate: Record<string, string>): LabRow {
  return {
    mapKey: testKey,
    testKey,
    displayName: testKey,
    subgroupId,
    values: new Map(Object.entries(valuesByDate).map(([date, value]) => [date, { value }])),
  }
}

describe('splitPivotIntoStackedPanels', () => {
  it('splits 生化 into 腎功能＋電解質 and 肝功能＋發炎＋心肌, each with its own dates', () => {
    const pivot: LabPivot = {
      category: chem,
      dates: ['2026-09-05', '2026-09-01', '2026-08-01'],
      rows: [
        row('CREA', 'renal', { '2026-09-05': '1.2', '2026-09-01': '1.1', '2026-08-01': '1.0' }),
        row('K', 'electrolyte', { '2026-09-05': '4.1' }),
        row('ALT', 'liver', { '2026-08-01': '30' }),
        row('CRP', 'inflam', { '2026-09-01': '—' }),
        row('TROP', 'cardiac', {}),
      ],
    }
    const panels = splitPivotIntoStackedPanels(pivot)
    expect(panels).toHaveLength(2)
    expect(panels[0].rows.map((r) => r.testKey)).toEqual(['CREA', 'K'])
    expect(panels[0].dates).toEqual(['2026-09-05', '2026-09-01', '2026-08-01'])
    expect(panels[1].rows.map((r) => r.testKey)).toEqual(['ALT', 'CRP', 'TROP'])
    // A dash is a missing value, so 09-01 does not count for the liver panel.
    expect(panels[1].dates).toEqual(['2026-08-01'])
  })

  it('keeps rows without a listed subgroup in the last panel', () => {
    const pivot: LabPivot = {
      category: chem,
      dates: ['2026-09-05'],
      rows: [
        row('BUN', 'renal', { '2026-09-05': '18' }),
        row('LIPASE', undefined, { '2026-09-05': '40' }),
      ],
    }
    const panels = splitPivotIntoStackedPanels(pivot)
    expect(panels.map((p) => p.rows.map((r) => r.testKey))).toEqual([['BUN'], ['LIPASE']])
  })

  it('keeps a pinned-only panel (header, no dates) rather than dropping it', () => {
    const pivot: LabPivot = {
      category: chem,
      dates: ['2026-09-05'],
      rows: [
        row('BUN', 'renal', {}),
        row('ALT', 'liver', { '2026-09-05': '22' }),
      ],
    }
    const panels = splitPivotIntoStackedPanels(pivot)
    expect(panels).toHaveLength(2)
    expect(panels[0].dates).toEqual([])
    expect(panels[1].dates).toEqual(['2026-09-05'])
  })

  it('returns the pivot untouched for a category without stackedPanels', () => {
    const pivot: LabPivot = { category: cbc, dates: ['2026-09-05'], rows: [row('HB', 'counts', { '2026-09-05': '12' })] }
    expect(splitPivotIntoStackedPanels(pivot)).toEqual([pivot])
  })
})
