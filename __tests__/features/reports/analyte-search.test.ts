import {
  buildAnalyteIndex,
  matchAnalytes,
} from '@/features/clinical-summary/reports/components/AnalyteSearchBox'
import type { LabPivot } from '@/src/shared/utils/lab-pivot.utils'

function row(testKey: string, displayName: string, opts: { unit?: string; dates?: string[] } = {}) {
  return {
    mapKey: testKey,
    testKey,
    displayName,
    unit: opts.unit,
    values: new Map((opts.dates ?? ['2026-08-01']).map((d) => [d, { value: '1', unit: opts.unit }])),
  }
}

function pivot(id: string, rows: ReturnType<typeof row>[]): LabPivot {
  return {
    category: { id, label: id, codes: [] } as unknown as LabPivot['category'],
    dates: ['2026-08-01'],
    rows: rows as unknown as LabPivot['rows'],
  }
}

const pivots = [
  pivot('cbc', [row('HB', '血色素', { unit: 'g/dL' }), row('PLT', '血小板')]),
  pivot('chem', [row('CREA', 'Creatinine', { unit: 'mg/dL' }), row('K', 'Potassium')]),
]
const labels = { cbc: '血液', chem: '生化' }

function index(audience: 'medical' | 'patient' = 'medical') {
  return buildAnalyteIndex(pivots, labels, 'standardized', audience, 'zh-TW')
}

describe('analyte search', () => {
  it('finds a column by its canonical short code', () => {
    const hits = matchAnalytes(index(), 'crea')
    expect(hits[0]).toMatchObject({ testKey: 'CREA', categoryId: 'chem', categoryLabel: '生化' })
  })

  it('finds a column by the institution report name, across categories', () => {
    const hits = matchAnalytes(index(), '血色素')
    expect(hits.map((h) => h.testKey)).toContain('HB')
    expect(hits[0].categoryId).toBe('cbc')
  })

  it('is case-insensitive and ranks prefix matches first', () => {
    const hits = matchAnalytes(index(), 'k')
    // 'K' is a prefix match; nothing else in the fixture starts with "k".
    expect(hits[0].testKey).toBe('K')
  })

  it('returns nothing for a blank query so the list stays closed', () => {
    expect(matchAnalytes(index(), '   ')).toEqual([])
  })

  it('reports a pinned-but-empty column as having no data', () => {
    const emptyPivot = [pivot('cbc', [row('WBC', 'WBC', { dates: [] })])]
    const hits = matchAnalytes(
      buildAnalyteIndex(emptyPivot, labels, 'standardized', 'medical', 'zh-TW'),
      'wbc',
    )
    expect(hits[0]).toMatchObject({ testKey: 'WBC', hasData: false })
  })

  it('deduplicates several mapKeys that resolve to the same column', () => {
    const duplicated = [pivot('chem', [
      row('CREA', 'Creatinine'),
      { ...row('CREA', 'CREATININE (serum)'), mapKey: 'NHI09015C:CREA' },
    ])]
    const hits = matchAnalytes(
      buildAnalyteIndex(duplicated, labels, 'standardized', 'medical', 'zh-TW'),
      'crea',
    )
    expect(hits).toHaveLength(1)
  })
})
