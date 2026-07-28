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

  it('does not put one misleading header unit over unnormalized mixed-unit cells', () => {
    const pivots = buildLabPivots([
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7' }] },
        valueQuantity: { value: 13.2, unit: 'g/dL', code: 'g/dL', system: 'http://unitsofmeasure.org' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2025-12-01',
        code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7' }] },
        valueQuantity: { value: 132, unit: 'g/L', code: 'g/L', system: 'http://unitsofmeasure.org' },
      },
    ])

    const row = pivots.cbc.rows.find((candidate) => candidate.testKey === 'HB')
    expect(row).toBeTruthy()
    expect(row!.unit).toBeUndefined()
    expect(row!.values.get('2026-01-01')).toMatchObject({ value: '13.2', unit: 'g/dL' })
    expect(row!.values.get('2025-12-01')).toMatchObject({ value: '132', unit: 'g/L' })
  })

  it('puts equivalent CBC aliases in one shared-unit column header', () => {
    const observations = [
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'MCV', coding: [{ system: 'http://loinc.org', code: '787-2' }] },
        valueQuantity: { value: 92.2, unit: 'fl' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'MCV', coding: [{ system: 'http://loinc.org', code: '787-2' }] },
        valueQuantity: { value: 93, unit: 'fL' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'MCH', coding: [{ system: 'http://loinc.org', code: '785-6' }] },
        valueQuantity: { value: 29.7, unit: 'pg/Cell' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'MCH', coding: [{ system: 'http://loinc.org', code: '785-6' }] },
        valueQuantity: { value: 30, unit: 'pg' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'MCHC', coding: [{ system: 'http://loinc.org', code: '786-4' }] },
        valueQuantity: { value: 32.3, unit: 'gHb/dL' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'MCHC', coding: [{ system: 'http://loinc.org', code: '786-4' }] },
        valueQuantity: { value: 32.1, unit: 'g/dL' },
      },
    ]

    const rows = buildLabPivots(observations).cbc.rows
    expect(rows.find((row) => row.testKey === 'MCV')?.unit).toBe('fL')
    expect(rows.find((row) => row.testKey === 'MCH')?.unit).toBe('pg')
    expect(rows.find((row) => row.testKey === 'MCHC')?.unit).toBe('g/dL')
  })

  it('puts eGFR, Na, K, and aminotransferase aliases in shared-unit column headers', () => {
    const observations = [
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'eGFR', coding: [{ system: 'http://loinc.org', code: '77147-7' }] },
        valueQuantity: { value: 52 },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'eGFR', coding: [{ system: 'http://loinc.org', code: '77147-7' }] },
        valueQuantity: {
          value: 54,
          unit: 'mL/min/1.73m2',
          code: 'mL/min/1.73.m2',
          system: 'http://unitsofmeasure.org',
        },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'Sodium', coding: [{ system: 'http://loinc.org', code: '2951-2' }] },
        valueQuantity: { value: 140, unit: 'mEq/L' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'Sodium', coding: [{ system: 'http://loinc.org', code: '2951-2' }] },
        valueQuantity: { value: 139, unit: 'mmol/L' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'Potassium', coding: [{ system: 'http://loinc.org', code: '2823-3' }] },
        valueQuantity: { value: 4.2, unit: 'mEq/L' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'Potassium', coding: [{ system: 'http://loinc.org', code: '2823-3' }] },
        valueQuantity: { value: 4.1, unit: 'mmol/L' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'AST', coding: [{ system: 'http://loinc.org', code: '1920-8' }] },
        valueQuantity: {
          value: 21,
          unit: 'IU/L',
          code: '[iU]/L',
          system: 'http://unitsofmeasure.org',
        },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'AST', coding: [{ system: 'http://loinc.org', code: '1920-8' }] },
        valueQuantity: {
          value: 19,
          unit: 'U/L',
          code: 'U/L',
          system: 'http://unitsofmeasure.org',
        },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'ALT', coding: [{ system: 'http://loinc.org', code: '1742-6' }] },
        valueQuantity: { value: 31, unit: 'IU/L' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'ALT', coding: [{ system: 'http://loinc.org', code: '1742-6' }] },
        valueQuantity: { value: 30, unit: 'U/L' },
      },
    ]

    const rows = buildLabPivots(observations).chem.rows
    expect(rows.find((row) => row.testKey === 'EGFR(M)')?.unit).toBe('mL/min/1.73m²')
    expect(rows.find((row) => row.testKey === 'NA')?.unit).toBe('mmol/L')
    expect(rows.find((row) => row.testKey === 'K')?.unit).toBe('mmol/L')
    expect(rows.find((row) => row.testKey === 'AST')?.unit).toBe('U/L')
    expect(rows.find((row) => row.testKey === 'ALT')?.unit).toBe('U/L')
  })

  it('moves a uniform percent unit to the header despite spelling and qualitative rows', () => {
    const observations = [
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-03',
        code: { text: 'Neutrophils', coding: [{ system: 'http://loinc.org', code: '770-8' }] },
        valueQuantity: {
          value: 48.9,
          unit: '％',
          code: '%',
          system: 'http://unitsofmeasure.org',
        },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'Neutrophils', coding: [{ system: 'http://loinc.org', code: '770-8' }] },
        valueQuantity: { value: 42.3, unit: '%' },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'Neutrophils' },
        valueString: 'No segmented neutrophil value reported',
      },
    ]

    const row = buildLabPivots(observations).cbc.rows.find(
      (candidate) => candidate.testKey === 'NEU',
    )
    expect(row?.unit).toBe('%')
    expect(row?.values.get('2026-01-03')?.unit).toBe('%')
    expect(row?.values.get('2026-01-02')?.unit).toBe('%')
    expect(row?.values.get('2026-01-01')?.unit).toBeUndefined()
  })

  it('uses the verified RDW-CV percent default so the unit can live in the header', () => {
    const observations = [
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-02',
        code: { text: 'RDW', coding: [{ system: 'http://loinc.org', code: '788-0' }] },
        valueQuantity: { value: 13.4 },
      },
      {
        resourceType: 'Observation',
        effectiveDateTime: '2026-01-01',
        code: { text: 'RDW', coding: [{ system: 'http://loinc.org', code: '788-0' }] },
        valueQuantity: { value: 13, unit: '%' },
      },
    ]

    const row = buildLabPivots(observations).cbc.rows.find(
      (candidate) => candidate.testKey === 'RDW',
    )
    expect(row?.unit).toBe('%')
  })
})
