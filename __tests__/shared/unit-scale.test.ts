import { cellConcScale, massConcScale, normalizeAnalyteUnit } from '@/src/shared/utils/unit-scale'

describe('cellConcScale — count-per-µL scale, all bridge spellings', () => {
  it('maps every recognised spelling to its scale relative to /µL', () => {
    expect(cellConcScale('/uL')).toBe(1)
    expect(cellConcScale('/μL')).toBe(1)
    expect(cellConcScale('k/μL')).toBe(1e3)
    expect(cellConcScale('K/uL')).toBe(1e3)
    expect(cellConcScale('1000/uL')).toBe(1e3)
    expect(cellConcScale('*1000/uL')).toBe(1e3)
    expect(cellConcScale('x10^3 /uL')).toBe(1e3)
    expect(cellConcScale('x10^4 /uL')).toBe(1e4)
    expect(cellConcScale('M/μL')).toBe(1e6)
    expect(cellConcScale('million/uL')).toBe(1e6)
    expect(cellConcScale('*10^6/uL')).toBe(1e6)
  })

  it('returns null for non-count / unknown units (never silently rescaled)', () => {
    expect(cellConcScale('mg/dL')).toBeNull()
    expect(cellConcScale('g/dL')).toBeNull()
    expect(cellConcScale('%')).toBeNull()
    expect(cellConcScale('')).toBeNull()
    expect(cellConcScale(undefined)).toBeNull()
  })
})

describe('massConcScale — mass-per-volume scale relative to mg/L', () => {
  it('maps recognised mass/volume units (1 mg/dL = 10 mg/L)', () => {
    expect(massConcScale('mg/L')).toBe(1)
    expect(massConcScale('mg/dL')).toBe(10)
    expect(massConcScale('g/L')).toBe(1000)
    expect(massConcScale('g/dL')).toBe(10000)
  })

  it('returns null for units outside the mass/volume family', () => {
    expect(massConcScale('/uL')).toBeNull()
    expect(massConcScale('mmol/L')).toBeNull()
    expect(massConcScale('%')).toBeNull()
    expect(massConcScale(undefined)).toBeNull()
  })
})

describe('normalizeAnalyteUnit — per-analyte canonical unit', () => {
  it('rescales WBC to K/µL across mixed source scales', () => {
    expect(normalizeAnalyteUnit('WBC', 5600, '/uL')).toEqual({ value: 5.6, unit: 'K/µL' })
    expect(normalizeAnalyteUnit('WBC', 5, 'k/μL')).toEqual({ value: 5, unit: 'K/µL' })
    expect(normalizeAnalyteUnit('WBC', 4.55, 'K/μL')).toEqual({ value: 4.55, unit: 'K/µL' })
  })

  it('rescales RBC to M/µL, including the x10^4 representation', () => {
    expect(normalizeAnalyteUnit('RBC', 3.5, 'M/μL')).toEqual({ value: 3.5, unit: 'M/µL' })
    expect(normalizeAnalyteUnit('RBC', 326, 'x10^4 /uL')).toEqual({ value: 3.26, unit: 'M/µL' })
  })

  it('rescales PLT to K/µL', () => {
    expect(normalizeAnalyteUnit('PLT', 200, '*1000/uL')).toEqual({ value: 200, unit: 'K/µL' })
  })

  it('rescales CRP to mg/dL: mg/L values are ÷10, mg/dL stay put', () => {
    expect(normalizeAnalyteUnit('CRP', 5, 'mg/L')).toEqual({ value: 0.5, unit: 'mg/dL' })
    expect(normalizeAnalyteUnit('CRP', 0.5, 'mg/dL')).toEqual({ value: 0.5, unit: 'mg/dL' })
    expect(normalizeAnalyteUnit('CRP', 85, 'mg/L')).toEqual({ value: 8.5, unit: 'mg/dL' })
  })

  it('rescales urine microalbumin to mg/dL', () => {
    expect(normalizeAnalyteUnit('MALB', 271.3, 'mg/L')).toEqual({ value: 27.13, unit: 'mg/dL' })
    expect(normalizeAnalyteUnit('MALB', 27.13, 'mg/dL')).toEqual({ value: 27.13, unit: 'mg/dL' })
  })

  it('is case-insensitive on the analyte key', () => {
    expect(normalizeAnalyteUnit('wbc', 5600, '/uL')).toEqual({ value: 5.6, unit: 'K/µL' })
    expect(normalizeAnalyteUnit('crp', 5, 'mg/L')).toEqual({ value: 0.5, unit: 'mg/dL' })
  })

  it('returns null for analytes not configured for scaling', () => {
    expect(normalizeAnalyteUnit('HB', 13, 'g/dL')).toBeNull()
    expect(normalizeAnalyteUnit('CA', 9.2, 'mg/dL')).toBeNull()
  })

  it('returns null (leaves value untouched) when the unit is not in the analyte family', () => {
    expect(normalizeAnalyteUnit('WBC', 5, 'mg/dL')).toBeNull()   // wrong family
    expect(normalizeAnalyteUnit('CRP', 5, '/uL')).toBeNull()     // wrong family
    expect(normalizeAnalyteUnit('WBC', 5, undefined)).toBeNull()
  })

  it('standardises equivalent CBC display-unit spellings without changing values', () => {
    expect(normalizeAnalyteUnit('MCV', 92.2, 'fl')).toEqual({ value: 92.2, unit: 'fL' })
    expect(normalizeAnalyteUnit('MCV', 92.2, 'fL')).toEqual({ value: 92.2, unit: 'fL' })
    expect(normalizeAnalyteUnit('MCH', 29.7, 'pg/Cell')).toEqual({ value: 29.7, unit: 'pg' })
    expect(normalizeAnalyteUnit('MCH', 29.7, 'pg')).toEqual({ value: 29.7, unit: 'pg' })
    expect(normalizeAnalyteUnit('MCHC', 32.3, 'gHb/dL')).toEqual({ value: 32.3, unit: 'g/dL' })
    expect(normalizeAnalyteUnit('MCHC', 32.3, 'g/dL')).toEqual({ value: 32.3, unit: 'g/dL' })
  })

  it('rescales MCHC g/L to the canonical g/dL column', () => {
    expect(normalizeAnalyteUnit('MCHC', 323, 'g/L')).toEqual({ value: 32.3, unit: 'g/dL' })
  })

  it('standardises Na and K mmol/L and mEq/L to mmol/L without rescaling', () => {
    expect(normalizeAnalyteUnit('NA', 140, 'mEq/L')).toEqual({ value: 140, unit: 'mmol/L' })
    expect(normalizeAnalyteUnit('NA', 140, 'mmol/L')).toEqual({ value: 140, unit: 'mmol/L' })
    expect(normalizeAnalyteUnit('K', 4.2, 'meq/L')).toEqual({ value: 4.2, unit: 'mmol/L' })
    expect(normalizeAnalyteUnit('K', 4.2, 'mmol/L')).toEqual({ value: 4.2, unit: 'mmol/L' })
  })

  it('standardises AST/ALT U/L and IU/L spellings to U/L', () => {
    expect(normalizeAnalyteUnit('AST', 21, 'U/L')).toEqual({ value: 21, unit: 'U/L' })
    expect(normalizeAnalyteUnit('AST', 21, '[iU]/L')).toEqual({ value: 21, unit: 'U/L' })
    expect(normalizeAnalyteUnit('ALT', 31, 'U/L')).toEqual({ value: 31, unit: 'U/L' })
    expect(normalizeAnalyteUnit('ALT', 31, 'IU/L')).toEqual({ value: 31, unit: 'U/L' })
    expect(normalizeAnalyteUnit('ALT', 31, '[IU]/L')).toEqual({ value: 31, unit: 'U/L' })
  })

  it('standardises ASCII/full-width percent and defaults verified RDW-CV only', () => {
    expect(normalizeAnalyteUnit('HCT', 37.2, '%')).toEqual({ value: 37.2, unit: '%' })
    expect(normalizeAnalyteUnit('NEU', 48.9, '％')).toEqual({ value: 48.9, unit: '%' })
    expect(normalizeAnalyteUnit('RDW', 13.4, undefined, { loincCode: '788-0' })).toEqual({
      value: 13.4,
      unit: '%',
    })
    expect(normalizeAnalyteUnit('RDW', 42, undefined, { loincCode: '21000-5' })).toBeNull()
  })

  it('standardises eGFR unit spellings and supplies the approved missing-unit default', () => {
    expect(normalizeAnalyteUnit('EGFR(M)', 52, 'mL/min/1.73m2')).toEqual({
      value: 52,
      unit: 'mL/min/1.73m²',
    })
    expect(normalizeAnalyteUnit('EGFR(EPI)', 52, 'mL/min/{1.73_m2}')).toEqual({
      value: 52,
      unit: 'mL/min/1.73m²',
    })
    expect(normalizeAnalyteUnit('EGFR(M)', 52, 'mL/min/1.73.m2')).toEqual({
      value: 52,
      unit: 'mL/min/1.73m²',
    })
    expect(normalizeAnalyteUnit('EGFR(M)', 52, undefined)).toEqual({
      value: 52,
      unit: 'mL/min/1.73m²',
    })
  })

  it('does not assume the body-surface-area eGFR unit from a conflicting supplied unit', () => {
    expect(normalizeAnalyteUnit('EGFR(M)', 52, 'mL/min')).toBeNull()
  })
})
