import { convertToBase, normUnit } from '@/features/medical-calculator/units'

describe('normUnit', () => {
  it('normalizes case, spaces, micro sign and superscripts', () => {
    expect(normUnit('mEq/L')).toBe('meq/l')
    expect(normUnit('µmol/L')).toBe('umol/l')
    expect(normUnit('μmol/L')).toBe('umol/l')
    expect(normUnit('10⁹/L')).toBe('10^9/l')
    expect(normUnit('10*3/uL')).toBe('10^3/ul')
  })
})

describe('convertToBase', () => {
  it('treats mEq/L as equivalent to mmol/L for electrolytes (factor 1, no change)', () => {
    const r = convertToBase(141, 'mEq/L', 'electrolyte')
    expect(r).not.toBeNull()
    expect(r!.value).toBe(141)
    expect(r!.changed).toBe(false)
  })

  it('converts creatinine µmol/L → mg/dL', () => {
    const r = convertToBase(176.8, 'µmol/L', 'creatinine')
    expect(r!.value).toBeCloseTo(2.0, 1)
    expect(r!.changed).toBe(true)
  })

  it('converts glucose mmol/L → mg/dL', () => {
    const r = convertToBase(10, 'mmol/L', 'glucose')
    expect(r!.value).toBeCloseTo(180.16, 1)
  })

  it('converts blood-gas pressure kPa → mmHg', () => {
    const r = convertToBase(12, 'kPa', 'pressure')
    expect(r!.value).toBeCloseTo(90.0, 0) // 12 × 7.5006
    expect(r!.changed).toBe(true)
    expect(convertToBase(90, 'mmHg', 'pressure')!.changed).toBe(false)
  })

  it('converts hemoglobin g/L → g/dL (and mmol/L → g/dL)', () => {
    expect(convertToBase(120, 'g/L', 'hemoglobin')!.value).toBeCloseTo(12.0, 1)
    expect(convertToBase(8, 'mmol/L', 'hemoglobin')!.value).toBeCloseTo(12.89, 1) // 8 × 1.6113
  })

  it('converts osmolality Osm/kg → mOsm/kg (and mOsm/kg unchanged)', () => {
    expect(convertToBase(0.29, 'Osm/kg', 'osmolality')!.value).toBeCloseTo(290, 0)
    expect(convertToBase(290, 'mOsm/kg', 'osmolality')!.changed).toBe(false)
  })

  it('converts FiO₂ fraction → percent', () => {
    expect(convertToBase(0.21, '1', 'fio2')!.value).toBeCloseTo(21, 0)
    expect(convertToBase(0.4, 'fraction', 'fio2')!.value).toBeCloseTo(40, 0)
    expect(convertToBase(21, '%', 'fio2')!.changed).toBe(false)
  })

  it('converts calcium mmol/L → mg/dL', () => {
    const r = convertToBase(2.5, 'mmol/L', 'calcium')
    expect(r!.value).toBeCloseTo(10.02, 1)
  })

  it('converts bilirubin µmol/L → mg/dL', () => {
    const r = convertToBase(34.2, 'umol/L', 'bilirubin')
    expect(r!.value).toBeCloseTo(2.0, 1)
  })

  it('converts albumin g/L → g/dL', () => {
    const r = convertToBase(40, 'g/L', 'albumin')
    expect(r!.value).toBeCloseTo(4.0, 5)
  })

  it('treats platelet 10³/µL, 1000/µL and 10⁹/L as equivalent', () => {
    expect(convertToBase(250, '10^3/uL', 'platelets')!.value).toBe(250)
    expect(convertToBase(250, '10⁹/L', 'platelets')!.value).toBe(250)
    const raw1000 = convertToBase(116, '1000/uL', 'platelets')
    expect(raw1000!.value).toBe(116)
    expect(raw1000!.changed).toBe(false)
  })

  it('scales raw /µL platelet counts', () => {
    const r = convertToBase(250000, '/uL', 'platelets')
    expect(r!.value).toBe(250)
    expect(r!.changed).toBe(true)
  })

  it('converts BUN mmol/L (urea) → mg/dL', () => {
    const r = convertToBase(7, 'mmol/L', 'bun')
    expect(r!.value).toBeCloseTo(19.6, 1)
    expect(r!.changed).toBe(true)
  })

  it('converts cholesterol mmol/L → mg/dL', () => {
    const r = convertToBase(5, 'mmol/L', 'cholesterol')
    expect(r!.value).toBeCloseTo(193.35, 1)
  })

  it('converts triglyceride mmol/L → mg/dL', () => {
    const r = convertToBase(2, 'mmol/L', 'triglyceride')
    expect(r!.value).toBeCloseTo(177.14, 1)
  })

  it('returns null for an unknown unit (caller keeps raw value + warns)', () => {
    expect(convertToBase(5, 'banana/L', 'creatinine')).toBeNull()
  })

  it('returns null when the input has no dimension', () => {
    expect(convertToBase(5, 'mg/dL', undefined)).toBeNull()
  })
})
