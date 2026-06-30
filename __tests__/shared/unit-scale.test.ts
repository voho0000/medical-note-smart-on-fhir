import { cellConcScale, normalizeCellConcUnit } from '@/src/shared/utils/unit-scale'

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

describe('normalizeCellConcUnit — per-analyte canonical unit', () => {
  it('rescales WBC to K/µL across mixed source scales', () => {
    expect(normalizeCellConcUnit('WBC', 5600, '/uL')).toEqual({ value: 5.6, unit: 'K/µL' })
    expect(normalizeCellConcUnit('WBC', 5, 'k/μL')).toEqual({ value: 5, unit: 'K/µL' })
    expect(normalizeCellConcUnit('WBC', 4.55, 'K/μL')).toEqual({ value: 4.55, unit: 'K/µL' })
  })

  it('rescales RBC to M/µL, including the x10^4 representation', () => {
    expect(normalizeCellConcUnit('RBC', 3.5, 'M/μL')).toEqual({ value: 3.5, unit: 'M/µL' })
    expect(normalizeCellConcUnit('RBC', 326, 'x10^4 /uL')).toEqual({ value: 3.26, unit: 'M/µL' })
  })

  it('rescales PLT to K/µL', () => {
    expect(normalizeCellConcUnit('PLT', 200, '*1000/uL')).toEqual({ value: 200, unit: 'K/µL' })
    expect(normalizeCellConcUnit('PLT', 152, 'K/μL')).toEqual({ value: 152, unit: 'K/µL' })
  })

  it('is case-insensitive on the analyte key', () => {
    expect(normalizeCellConcUnit('wbc', 5600, '/uL')).toEqual({ value: 5.6, unit: 'K/µL' })
  })

  it('returns null for analytes not configured for scaling', () => {
    expect(normalizeCellConcUnit('HB', 13, 'g/dL')).toBeNull()
    expect(normalizeCellConcUnit('NA', 140, 'mmol/L')).toBeNull()
  })

  it('returns null (leaves value untouched) when the unit is not a recognised count unit', () => {
    expect(normalizeCellConcUnit('WBC', 5, 'mg/dL')).toBeNull()
    expect(normalizeCellConcUnit('WBC', 5, undefined)).toBeNull()
  })
})
