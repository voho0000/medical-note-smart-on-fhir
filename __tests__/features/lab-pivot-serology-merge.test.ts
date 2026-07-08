import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

// Real hepatitis-panel observations from a 健康存摺 bundle (nhi …-v1.3.10).
// Anti-HBc (NHI 14037C) ships as a qualitative + quantitative PAIR under two
// LOINCs, both resolving to canonical ANTI-HBC. They must merge into one cell,
// not clobber each other. HBsAg / Anti-HBs are single numeric results.
const DATE = '2025-12-16T00:00:00+08:00'
const N_INTERP = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'N', display: 'Normal' }] }]

const antiHbcQual = {
  resourceType: 'Observation',
  code: {
    coding: [
      { system: 'http://loinc.org', code: '13952-7', display: 'Hepatitis B virus core Ab [Presence] in Serum or Plasma by Immunoassay' },
      { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', code: '14037C', display: 'Ｂ型肝炎核心抗體檢查' },
    ],
    text: 'Anti-HBc',
  },
  effectiveDateTime: DATE,
  valueCodeableConcept: { coding: [{ system: 'https://nhi-fhir-bridge.github.io/CodeSystem/observation-value', code: 'reactive', display: 'Reactive' }], text: 'Reactive' },
  interpretation: N_INTERP,
  specimen: { display: 'Blood' },
}

const antiHbcQuant = {
  resourceType: 'Observation',
  code: {
    coding: [
      { system: 'http://loinc.org', code: '22316-4', display: 'Hepatitis B virus core Ab [Units/volume] in Serum' },
      { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', code: '14037C', display: 'Ｂ型肝炎核心抗體檢查' },
    ],
    text: 'Anti-HBc',
  },
  effectiveDateTime: DATE,
  valueQuantity: { value: 0.012, unit: 'COI' },
  interpretation: N_INTERP,
  specimen: { display: 'Blood' },
}

const hbsAg = {
  resourceType: 'Observation',
  code: {
    coding: [
      { system: 'http://loinc.org', code: '5196-1', display: 'Hepatitis B virus surface Ag [Units/volume] in Serum' },
      { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', code: '14032C', display: 'Ｂ型肝炎表面抗原(定性)-EIA/LIA' },
    ],
    text: 'B型肝炎表面抗原',
  },
  effectiveDateTime: DATE,
  valueQuantity: { value: 0.333, unit: 'COI' },
  interpretation: N_INTERP,
  specimen: { display: 'Blood' },
}

const antiHbs = {
  resourceType: 'Observation',
  code: {
    coding: [
      { system: 'http://loinc.org', code: '5193-8', display: 'Hepatitis B virus surface Ab [Units/volume] in Serum or Plasma by Immunoassay' },
      { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', code: '14033C', display: 'Ｂ型肝炎表面抗體' },
    ],
    text: 'Anti-HBs',
  },
  effectiveDateTime: DATE,
  valueQuantity: { value: 187.2, unit: 'IU/L', system: 'http://unitsofmeasure.org', code: '[iU]/L' },
  interpretation: N_INTERP,
  specimen: { display: 'Blood' },
}

function hepRow(obsList: any[], testKey: string) {
  const pivots = buildLabPivots(obsList)
  const hep = pivots['hep']
  expect(hep).toBeDefined()
  return hep.rows.find(r => r.testKey === testKey)
}

describe('hepatitis panel → BC肝 cumulative pivot', () => {
  const all = [antiHbcQual, antiHbcQuant, hbsAg, antiHbs]

  it('HBsAg (5196-1) lands in the HBSAG column with its COI value', () => {
    const row = hepRow(all, 'HBSAG')
    expect(row).toBeDefined()
    expect(row!.values.get('2025-12-16')?.value).toBe('0.333')
  })

  it('Anti-HBs (5193-8) lands in the ANTI-HBS column', () => {
    const row = hepRow(all, 'ANTI-HBS')
    expect(row).toBeDefined()
    expect(row!.values.get('2025-12-16')?.value).toBe('187.2')
  })

  it('Anti-HBc qual + quant merge into one ANTI-HBC cell "Reactive (0.012)"', () => {
    const row = hepRow(all, 'ANTI-HBC')
    expect(row).toBeDefined()
    expect(row!.values.get('2025-12-16')?.value).toBe('Reactive (0.012)')
  })

  it('merge is order-independent (quant arrives before qual)', () => {
    const row = hepRow([antiHbcQuant, antiHbcQual], 'ANTI-HBC')
    expect(row!.values.get('2025-12-16')?.value).toBe('Reactive (0.012)')
  })

  // Cross-source robustness: column assignment must be LOINC-driven, not
  // dependent on English display text. A different hospital / EHR may send the
  // analyte with only a Chinese name — it must still land in the right column.
  it('Anti-HBs via 22322-2 + Chinese-only text still lands in ANTI-HBS', () => {
    const cnAntiHbs = {
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: '22322-2', display: 'Ｂ型肝炎表面抗體' }], text: 'Ｂ型肝炎表面抗體' },
      effectiveDateTime: DATE,
      valueCodeableConcept: { text: 'Positive' },
      specimen: { display: 'Serum' },
    }
    const row = hepRow([cnAntiHbs], 'ANTI-HBS')
    expect(row).toBeDefined()
    expect(row!.values.get('2025-12-16')?.value).toBe('Positive')
  })

  it('HBeAg via 13954-3 + Chinese-only text still lands in HBEAG', () => {
    const cnHbeAg = {
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: '13954-3', display: 'Ｂ型肝炎ｅ抗原' }], text: 'Ｂ型肝炎ｅ抗原' },
      effectiveDateTime: DATE,
      valueCodeableConcept: { text: 'Non-reactive' },
      specimen: { display: 'Serum' },
    }
    const row = hepRow([cnHbeAg], 'HBEAG')
    expect(row).toBeDefined()
    expect(row!.values.get('2025-12-16')?.value).toBe('Non-reactive')
  })

  it('two same-day NUMERIC results still last-write-win (no merge)', () => {
    const glucoseA = { resourceType: 'Observation', code: { coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }], text: 'Glucose AC' }, effectiveDateTime: DATE, valueQuantity: { value: 95, unit: 'mg/dL' }, specimen: { display: 'Blood' } }
    const glucoseB = { ...glucoseA, valueQuantity: { value: 110, unit: 'mg/dL' } }
    const pivots = buildLabPivots([glucoseA, glucoseB])
    const glu = pivots['glucose']
    const row = glu.rows.find(r => r.values.get('2025-12-16'))
    expect(row).toBeDefined()
    // last-write-wins → 110, and NOT a concatenation like "95 (110)"
    expect(row!.values.get('2025-12-16')?.value).toBe('110')
  })
})
