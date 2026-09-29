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

  it('does not count the unit written into a raw value as a difference', () => {
    const rows = [converted(1, 5, 'Testosterone', q(2.33), ['09121C'])]
    const pairing = pairRawRows(rows, [raw(1, [5], { order_code: '09121C', assay_item_name: 'Testosterone', unit_data: 'ng/mL' }, '2.33 ng/mL')])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1]])
    expect(pairing.valueDiffers.size).toBe(0)
  })

  it.each([
    ['a comparator', { kind: 'quantity', value: 0.5, magnitude: -1, decimals: 1 }, '<0.5'],
    ['a comparator the other way', { kind: 'quantity', value: 0.5, comparator: '<', magnitude: -1, decimals: 1 }, '0.5'],
    ['qualitative wording', { kind: 'string', value: 'Reactive(0.18)', length: 14 }, 'Nonreactive(0.18)'],
    ['a sign', { kind: 'string', value: '(+)', length: 3 }, '(-)'],
  ])('flags %s as a different result', (_label, value, rawValue) => {
    const pairing = pairRawRows([converted(1, 0, 'HBsAg', value as LabDataReportRow['value'])], [raw(1, [0], { assay_item_name: 'HBsAg' }, rawValue)])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1]])
    expect([...pairing.valueDiffers]).toEqual([1])
  })

  it.each([
    ['≦0.5', { kind: 'quantity', value: 0.5, comparator: '<=', magnitude: -1, decimals: 1 }],
    ['Nonreactive(0.18)', { kind: 'string', value: 'Nonreactive (0.18)', length: 18 }],
    ['1+', { kind: 'string', value: '1+', length: 2 }],
  ])('treats %j as the same result', (rawValue, value) => {
    const pairing = pairRawRows([converted(1, 0, 'X', value as LabDataReportRow['value'])], [raw(1, [0], { assay_item_name: 'X' }, rawValue)])
    expect(pairing.valueDiffers.size).toBe(0)
    expect(pairing.convertedByRaw.size).toBe(1)
  })

  it('pairs by test name before a shared order code, so swapped values show', () => {
    // WBC and RBC share 08011C; the conversion swapped their values.
    const rows = [converted(1, 0, 'WBC', q(4.5), ['08011C']), converted(2, 0, 'RBC', q(6.1), ['08011C'])]
    const rawRows = [
      raw(1, [0], { order_code: '08011C', assay_item_name: 'WBC' }, '6.1'),
      raw(2, [0], { order_code: '08011C', assay_item_name: 'RBC' }, '4.5'),
    ]
    const pairing = pairRawRows(rows, rawRows)
    expect([...pairing.convertedByRaw]).toEqual([[1, 1], [2, 2]])
    expect([...pairing.valueDiffers].sort()).toEqual([1, 2])
  })

  it('does not pair on an order code several tests share that day', () => {
    const rows = [converted(1, 0, '白血球', q(6.1), ['08011C']), converted(2, 0, '紅血球', q(4.5), ['08011C'])]
    const pairing = pairRawRows(rows, [raw(1, [0], { order_code: '08011C', assay_item_name: 'Leukocyte' }, '6.1')])
    expect(pairing.convertedByRaw.size).toBe(0)
    expect(pairing.unmatchedRaw).toEqual([1])
  })

  it('pairs on an order code only one test carries that day', () => {
    const rows = [converted(1, 0, '肌酸酐', q(1.1), ['09015C'])]
    const pairing = pairRawRows(rows, [raw(1, [0], { order_code: '09015C', assay_item_name: 'Creatinine' }, '1.1')])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1]])
  })

  it('does not force a differing pair among several candidates', () => {
    const rows = [converted(1, 0, 'K', q(4.1)), converted(2, 0, 'K', q(4.2))]
    const pairing = pairRawRows(rows, [raw(1, [0], { assay_item_name: 'K' }, '5.0')])
    expect(pairing.convertedByRaw.size).toBe(0)
  })

  it('matches source names to the converted column through the canonical key', () => {
    const rows = [
      { ...converted(1, 0, 'Hb', q(13.2), ['08011C']), app: { categoryId: 'cbc', decidedBy: 'loinc' as const, testKey: 'HB', column: 'Hb' } },
      { ...converted(2, 0, 'Neutrophils %', q(61), ['08013C']), app: { categoryId: 'cbc', decidedBy: 'loinc' as const, testKey: 'NEU', column: 'NEU' } },
      { ...converted(3, 0, 'Lymphocytes %', q(30), ['08013C']), app: { categoryId: 'cbc', decidedBy: 'loinc' as const, testKey: 'LYM', column: 'LYM' } },
    ]
    const pairing = pairRawRows(rows, [
      raw(1, [0], { order_code: '08011C', assay_item_name: 'HGB' }, '13.2'),
      raw(2, [0], { order_code: '08013C', assay_item_name: 'Neutrophil 嗜中性多核球' }, '61'),
      raw(3, [0], { order_code: '08013C', assay_item_name: 'Lymphocyte 淋巴球' }, '30'),
    ])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(pairing.valueDiffers.size).toBe(0)
  })

  it('matches a name written into a longer converted text as a whole word only', () => {
    const rows = [converted(1, 0, '睪丸酯醇免疫分析 ;(Testosterone (EIA/LIA))', q(2.3), ['09121C']), converted(2, 0, 'HbA1c', q(6.1))]
    const pairing = pairRawRows(rows, [
      raw(1, [0], { assay_item_name: 'Testosterone' }, '2.3'),
      raw(2, [0], { assay_item_name: 'Hb' }, '6.1'),
    ])
    expect([...pairing.convertedByRaw]).toEqual([[1, 1]])
    expect(pairing.unmatchedRaw).toEqual([2])
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
