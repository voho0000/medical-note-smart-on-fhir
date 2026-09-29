import { pairRawRows } from '@/features/lab-data-report/admin/raw-pairing'
import type { LabDataReportRawRow, LabDataReportRow } from '@/features/lab-data-report/types'

const converted = (ref: number, day: number | null, text: string, value: LabDataReportRow['value'], codes: string[] = []): LabDataReportRow => ({
  ref, day, performer: [], code: { text, codings: codes.map((code) => ({ code })) }, category: ['laboratory'], value,
  interpretation: [], referenceRange: [], sourceExtensions: [], sourceTags: [],
  app: { categoryId: 'cbc', decidedBy: 'loinc', testKey: text, column: text },
})
const raw = (ref: number, days: number[], fields: LabDataReportRawRow['fields'], value?: string | number): LabDataReportRawRow => ({
  ref, source: 's02', dates: Object.fromEntries(days.map((day, i) => [['case_time', 'real_inspect_date', 'recipe_date'][i], { day }])),
  fields, results: value === undefined ? {} : { assay_value: value }, withheld: {},
})
const q = (value: number) => ({ kind: 'quantity' as const, value, magnitude: 0, decimals: 1 })

describe('pairRawRows', () => {
  it('pairs by day + order code or name + value, one to one', () => {
    const rows = [converted(1, 3, 'Hb', q(11.2), ['08003C']), converted(2, 3, 'Hb', q(11.2), ['08003C']), converted(3, 4, 'PLT', q(250))]
    const rawRows = [
      raw(1, [3], { order_code: '08003C', assay_item_name: 'Hb' }, '11.2'),
      raw(2, [9, 3], { assay_item_name: 'hb' }, '11.20'),
      raw(3, [4], { assay_item_name: 'Glu' }, '98'),
    ]
    const pairing = pairRawRows(rows, rawRows)
    expect([...pairing.convertedByRaw]).toEqual([[1, 1], [2, 2]])
    expect(pairing.unmatchedRaw).toEqual([3])
    expect(pairing.unmatchedConverted).toEqual([3])
  })

  it('prefers the raw row whose value matches exactly', () => {
    const rows = [converted(1, 0, 'K', q(4.41))]
    const rawRows = [raw(1, [0], { assay_item_name: 'K' }), raw(2, [0], { assay_item_name: 'K' }, '4.41')]
    expect([...pairRawRows(rows, rawRows).convertedByRaw]).toEqual([[2, 1]])
  })

  it('pairs equal values first, then flags a same-day same-test pair whose values differ', () => {
    const rows = [converted(1, 0, 'CRP', { kind: 'quantity', value: 0.5, comparator: '<', magnitude: -1, decimals: 1 }), converted(2, 0, 'CRP', q(2))]
    const rawRows = [raw(1, [0], { assay_item_name: 'CRP' }, '<0.5'), raw(2, [0], { assay_item_name: 'CRP' }, '3')]
    const pairing = pairRawRows(rows, rawRows)
    expect([...pairing.convertedByRaw]).toEqual([[1, 1], [2, 2]])
    expect([...pairing.valueDiffers]).toEqual([2])
    expect(pairing.unmatchedRaw).toEqual([])
  })

  it('reads the one number in a raw text value', () => {
    const rows = [converted(1, 5, 'Testosterone', q(2.33), ['09121C'])]
    const pairing = pairRawRows(rows, [raw(1, [5], { order_code: '09121C', assay_item_name: 'Testosterone' }, '2.33 ng/mL')])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1]])
    expect(pairing.valueDiffers.size).toBe(0)
  })

  it('keeps rows from another module out of "no raw row"', () => {
    const other = { ...converted(1, 0, 'Creatinine', q(1.1), ['09015C']), sourceTags: ['source-module:imue0140'] }
    const lab = { ...converted(2, 0, 'Hb', q(12), ['08003C']), sourceTags: ['source-module:imue0060'] }
    const pairing = pairRawRows([other, lab], [raw(1, [0], { order_code: '09015C', assay_item_name: 'Creatinine' }, '1.1')])
    expect(pairing.convertedByRaw.size).toBe(0)
    expect(pairing.otherSource).toEqual([1])
    expect(pairing.unmatchedConverted).toEqual([2])
  })

  it('pairs S03 history rows by name and date', () => {
    const rows = [converted(1, -400, 'HbA1c', q(6.8))]
    const history: LabDataReportRawRow = { ref: 1, source: 's03', dates: { assaY_DATE: { day: -400 } }, fields: { assaY_NAME: 'HbA1c' }, results: { assaY_VALUE: 6.8 }, withheld: {} }
    expect([...pairRawRows(rows, [history]).convertedByRaw]).toEqual([[1, 1]])
  })
})
