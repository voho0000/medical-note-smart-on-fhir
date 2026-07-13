import { immunizationsCategory } from '@/src/core/categories/immunizations.category'

describe('immunizationsCategory', () => {
  it('keeps every administration event instead of collapsing equal vaccine names', () => {
    const data = [
      { id: 'dose-1', status: 'completed', occurrenceDateTime: '2024-01-01', vaccineCode: { text: 'Influenza vaccine' }, lotNumber: 'A' },
      { id: 'dose-2', status: 'completed', occurrenceDateTime: '2025-01-01', vaccineCode: { text: 'Influenza vaccine' }, lotNumber: 'B' },
    ] as any
    const section = immunizationsCategory.getContextSection(data, { immunizationTimeRange: 'all' }) as any

    expect(immunizationsCategory.getCount(data, { immunizationTimeRange: 'all' })).toBe(2)
    expect(section?.items).toHaveLength(2)
    expect(section?.items[0]).toContain('lot=B')
    expect(section?.items[1]).toContain('lot=A')
  })

  it('labels entered-in-error records as invalid rather than administered', () => {
    const section = immunizationsCategory.getContextSection([{
      id: 'error',
      status: 'entered-in-error',
      vaccineCode: { text: 'Incorrect vaccine record' },
    }] as any, { immunizationTimeRange: 'all' }) as any

    expect(section?.items[0]).toContain('INVALIDATED—do not treat as administered')
  })
})
