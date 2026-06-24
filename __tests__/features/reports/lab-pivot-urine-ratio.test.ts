import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

describe('buildLabPivots — urine albumin/creatinine ratio grouping', () => {
  it('groups MALB, urine CREA, and Chinese ACR text into the urine ratio subgroup', () => {
    const pivots = buildLabPivots([
      {
        id: 'malb',
        code: { text: 'MALB' },
        valueQuantity: { value: 80, unit: 'mg/L' },
        effectiveDateTime: '2026-01-28',
        specimen: { display: 'Urine' },
      },
      {
        id: 'urine-crea',
        code: { text: 'CREA' },
        valueQuantity: { value: 100, unit: 'mg/dL' },
        effectiveDateTime: '2026-01-28',
        specimen: { display: 'Urine' },
      },
      {
        id: 'acr',
        code: { text: '微白蛋白/肌酐酸比值' },
        valueString: '1+ (80) POS',
        effectiveDateTime: '2026-01-28',
        specimen: { display: 'Urine' },
      },
    ])

    const urine = pivots.urine
    const ratioRows = urine.rows.filter((row) => row.subgroupId === 'ratio')

    expect(ratioRows.map((row) => row.testKey)).toEqual(['MALB', 'CREA', 'ACR'])
    expect(ratioRows.map((row) => row.displayName)).toEqual(['MALB', 'CREA', 'ACR'])
    expect(urine.rows.filter((row) => row.values.size > 0 && !row.subgroupId)).toEqual([])
  })
})
