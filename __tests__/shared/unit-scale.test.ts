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

  it('is case-insensitive on the analyte key', () => {
    expect(normalizeAnalyteUnit('wbc', 5600, '/uL')).toEqual({ value: 5.6, unit: 'K/µL' })
    expect(normalizeAnalyteUnit('crp', 5, 'mg/L')).toEqual({ value: 0.5, unit: 'mg/dL' })
  })

  it('returns null for analytes not configured for scaling', () => {
    expect(normalizeAnalyteUnit('HB', 13, 'g/dL')).toBeNull()
    expect(normalizeAnalyteUnit('NA', 140, 'mmol/L')).toBeNull()
  })

  it('returns null (leaves value untouched) when the unit is not in the analyte family', () => {
    expect(normalizeAnalyteUnit('WBC', 5, 'mg/dL')).toBeNull()   // wrong family
    expect(normalizeAnalyteUnit('CRP', 5, '/uL')).toBeNull()     // wrong family
    expect(normalizeAnalyteUnit('WBC', 5, undefined)).toBeNull()
  })
})
