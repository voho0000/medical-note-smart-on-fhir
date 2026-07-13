import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

// A blood WBC observation (LOINC 6690-2) carrying value+unit, on a given date.
function wbc(value: number, unit: string, date: string, code = unit) {
  return {
    resourceType: 'Observation',
    effectiveDateTime: date,
    code: { text: 'WBC', coding: [{ system: 'http://loinc.org', code: '6690-2', display: 'WBC' }] },
    valueQuantity: { value, unit, code, system: 'http://unitsofmeasure.org' },
  }
}

describe('buildLabPivots — cumulative-report blood-count unit normalisation', () => {
  it('rescales mixed WBC scales to one canonical unit per column', () => {
    const pivots = buildLabPivots([
      wbc(5600, '/uL', '2026-01-01'), // raw per-µL
      wbc(5, 'k/μL', '2026-02-01'),   // already thousands
    ])
    const cbc = pivots['cbc']
    const row = cbc.rows.find((r) => r.testKey === 'WBC')
    expect(row).toBeTruthy()
    // The whole column now reads in one unit — no "5 next to 5600".
    expect(row!.unit).toBe('K/µL')
    expect(row!.values.get('2026-01-01')).toMatchObject({ value: '5.6', unit: 'K/µL' })
    expect(row!.values.get('2026-02-01')).toMatchObject({ value: '5', unit: 'K/µL' })
  })

  it('uses the UCUM code when the human-readable unit uses a local spelling', () => {
    const pivots = buildLabPivots([
      wbc(6.8, '1000/uL', '2024-10-11', '10*3/uL'),
      wbc(4790, '/cumm', '2024-06-26', '/uL'),
    ])
    const row = pivots['cbc'].rows.find((r) => r.testKey === 'WBC')

    expect(row).toBeTruthy()
    expect(row!.unit).toBe('K/µL')
    expect(row!.values.get('2024-10-11')).toMatchObject({ value: '6.8', unit: 'K/µL' })
    expect(row!.values.get('2024-06-26')).toMatchObject({ value: '4.79', unit: 'K/µL' })
  })

  it('leaves a non-count analyte (e.g. Hb in g/dL) untouched', () => {
    const hb = {
      resourceType: 'Observation',
      effectiveDateTime: '2026-01-01',
      code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
      valueQuantity: { value: 13.2, unit: 'g/dL', code: 'g/dL', system: 'http://unitsofmeasure.org' },
    }
    const pivots = buildLabPivots([hb])
    const cbc = pivots['cbc']
    const row = cbc.rows.find((r) => r.testKey === 'HB')
    expect(row).toBeTruthy()
    expect(row!.values.get('2026-01-01')).toMatchObject({ value: '13.2', unit: 'g/dL' })
  })
})
