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

  it('normalizes mixed MALB units and aliases the real NHI urine-creatinine label', () => {
    const nhiSystem = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'
    const loincSystem = 'http://loinc.org'
    const ucumSystem = 'http://unitsofmeasure.org'
    const pivots = buildLabPivots([
      {
        id: 'malb-2025-a',
        code: {
          text: '微量白蛋白',
          coding: [
            { system: nhiSystem, code: '12111C', display: '微白蛋白 (免疫比濁法)' },
            { system: loincSystem, code: '14957-5', display: 'Microalbumin [Mass/volume] in Urine' },
          ],
        },
        valueQuantity: { value: 18.4, unit: 'mg/dL', code: 'mg/dL', system: ucumSystem },
        effectiveDateTime: '2025-03-01',
        specimen: { display: 'Urine' },
      },
      {
        id: 'malb-2025-b',
        code: {
          text: '微量白蛋白',
          coding: [
            { system: nhiSystem, code: '12111C', display: '微白蛋白 (免疫比濁法)' },
            { system: loincSystem, code: '14957-5', display: 'Microalbumin [Mass/volume] in Urine' },
          ],
        },
        valueQuantity: { value: 22.6, unit: 'mg/dL', code: 'mg/dL', system: ucumSystem },
        effectiveDateTime: '2025-01-15',
        specimen: { display: 'Urine' },
      },
      {
        id: 'malb-2024',
        code: {
          text: '微量白蛋白',
          coding: [
            { system: nhiSystem, code: '12111C', display: '微白蛋白 (免疫比濁法)' },
            { system: loincSystem, code: '14957-5', display: 'Microalbumin [Mass/volume] in Urine' },
          ],
        },
        valueQuantity: { value: 271.3, unit: 'mg/L', code: 'mg/L', system: ucumSystem },
        referenceRange: [{ low: { value: 0, unit: 'mg/L' }, high: { value: 30, unit: 'mg/L' } }],
        effectiveDateTime: '2024-02-23',
        specimen: { display: 'Urine' },
      },
      {
        id: 'urine-creatinine-2024',
        code: {
          text: '尿液肌酸酐',
          coding: [
            { system: nhiSystem, code: '09016C', display: '肌酐、尿' },
            { system: loincSystem, code: '2161-8', display: 'Creatinine [Mass/volume] in Urine' },
          ],
        },
        valueQuantity: { value: 271.3, unit: 'mg/dL', code: 'mg/dL', system: ucumSystem },
        referenceRange: [{ low: { value: 60, unit: 'mg/dL' }, high: { value: 250, unit: 'mg/dL' } }],
        effectiveDateTime: '2024-02-23',
        specimen: { display: 'Urine' },
      },
    ])

    const populatedRatioRows = pivots.urine.rows.filter((row) => row.subgroupId === 'ratio' && row.values.size > 0)
    const malb = populatedRatioRows.find((row) => row.testKey === 'MALB')
    const urineCreatinine = populatedRatioRows.find((row) => row.testKey === 'CREA')

    expect(populatedRatioRows.map((row) => row.testKey)).toEqual(['MALB', 'CREA'])
    expect(malb).toMatchObject({ unit: 'mg/dL' })
    expect(malb?.values.get('2024-02-23')).toMatchObject({ value: '27.13', unit: 'mg/dL', isAbnormal: true })
    expect(urineCreatinine).toMatchObject({ displayName: 'CREA', subgroupId: 'ratio', unit: 'mg/dL' })
    expect(urineCreatinine?.values.get('2024-02-23')).toMatchObject({ value: '271.3', unit: 'mg/dL', isAbnormal: true })
    expect(pivots.urine.rows.filter((row) => row.values.size > 0 && !row.subgroupId)).toEqual([])
  })
})
