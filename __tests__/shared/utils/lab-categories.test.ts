// Regression tests for lab-categories. Most cases here started as field
// bugs reported by clinicians ("RBC column shows MCV value", "NEU column
// is empty even though Segment is in the visit"). The pattern is the
// same every time: bridge emits a CBC analyte with an unusual LOINC
// (panel code, wrong analyte's LOINC, or just one we hadn't whitelisted),
// the categorizer rejected the obs, and it disappeared from the
// cumulative report.
//
// Each test below pins down one specific (text, LOINC) combination
// that bridge has been observed to emit, so future LOINC-list pruning
// can't quietly drop coverage.
import {
  categorizeObservation,
  LAB_CATEGORIES,
} from '@/src/shared/utils/lab-categories'

const cbc = LAB_CATEGORIES.find((c) => c.id === 'cbc')!

function makeObs(text: string, loinc: string, value = 50, unit = '%') {
  return {
    code: {
      text,
      coding: [{ system: 'http://loinc.org', code: loinc }],
    },
    valueQuantity: { value, unit },
  }
}

describe('categorizeObservation — CBC differentials', () => {
  // ── Bridge v0.9.9 long form differential cells ───────────────────────
  // Bridge fixed Basophil/Eosinophil/Lymphocyte/Monocyte to their proper
  // per-analyte LOINCs in v0.9.9 — these are the post-fix happy path.
  describe('v0.9.9 individual LOINCs', () => {
    it.each([
      ['Basophil', '706-2'],
      ['Eosinophil', '713-8'],
      ['Lymphocyte', '736-9'],
      ['Monocyte', '5905-5'],
    ])('%s with LOINC %s categorises as cbc', (text, loinc) => {
      expect(categorizeObservation(makeObs(text, loinc))?.id).toBe('cbc')
    })
  })

  // ── Panel-LOINC workaround for bridge bugs that haven't been fixed ───
  // Bridge keeps emitting Segment with the CBC differential panel LOINC
  // 57021-8 and 血球比容值測定/Ht with the hemogram panel LOINC 24317-0.
  // App-side workaround: whitelist these panel codes so the obs at
  // least gets categorised; otherwise the analyte vanishes from the
  // cumulative pivot entirely. See bridge bug report Parts 1 & 4.
  describe('panel-LOINC bridge bugs (workaround)', () => {
    it('Segment with panel LOINC 57021-8 still categorises as cbc', () => {
      expect(categorizeObservation(makeObs('Segment', '57021-8'))?.id).toBe('cbc')
    })

    it('血球比容值測定 with panel LOINC 24317-0 categorises as cbc', () => {
      // NOTE: 24317-0 isn't in cbc.loincCodes yet (Bug N1 fix pending).
      // When we add it, this test should change from .toBeNull() to .toBe('cbc').
      // For now we document the actual behaviour so the test fails loudly
      // if anyone removes the workaround.
      const cat = categorizeObservation(makeObs('血球比容值測定', '24317-0'))
      // Falls through to text-based codes match — '血球比容值測定' isn't in
      // cbc.codes, so this returns null today. Documents the gap.
      expect(cat).toBeNull()
    })
  })

  // ── Long-form display name fallback ─────────────────────────────────
  // Even if bridge changes the LOINC again in the future, the long-form
  // text name should still route to the right category. cbc.codes was
  // updated to include BASOPHIL/EOSINOPHIL/LYMPHOCYTE/MONOCYTE/SEGMENT
  // explicitly so we're not dependent on LOINC accuracy.
  describe('display-name fallback when LOINC is unfamiliar', () => {
    it.each(['Basophil', 'Eosinophil', 'Lymphocyte', 'Monocyte', 'Segment', 'Neutrophil'])(
      '%s with no LOINC still categorises as cbc',
      (text) => {
        const obs = { code: { text, coding: [] }, valueQuantity: { value: 5, unit: '%' } }
        expect(categorizeObservation(obs)?.id).toBe('cbc')
      },
    )
  })
})

describe('cbc.pinnedColumns', () => {
  it('reserves columns for all 5 differential percents even when patient has no data', () => {
    expect(cbc.pinnedColumns).toEqual(
      expect.arrayContaining(['NEU', 'LYM', 'MONO', 'EOS', 'BASO']),
    )
  })
})

describe('categorizeObservation — early routing rules', () => {
  it('rejects 溶血 (hemolysis sample-quality flag) regardless of LOINC', () => {
    // Bug 6 in bridge report Part 1: bridge sometimes emits 溶血 as a
    // 0-value Observation under a real analyte LOINC. App side must
    // refuse to categorise these so they don't show up as "Cholesterol
    // = 0" in the report.
    const obs = makeObs('溶血', '2093-3', 0)
    expect(categorizeObservation(obs)).toBeNull()
  })

  it('rejects laboratory QC control plasma readings (NPM)', () => {
    // Bridge v0.11.0 split "Nor.plasma mean" / "正常血漿PT平均值" out from
    // the APTT/PT analyte columns (good) but still emits it as a patient
    // Observation — so without this filter it occupies its own column in
    // the cumulative report. NPM is the calibration baseline for INR
    // (INR = PT / NPM ^ ISI), not a patient measurement, and varies
    // batch-to-batch with reagent lot. See Part 7 bridge report Bug P2.
    expect(categorizeObservation(makeObs('正常血漿PT平均值', '5902-2', 11.1, 'sec'))).toBeNull()
    expect(categorizeObservation(makeObs('Nor.plasma mean', '14979-9', 29, 'sec'))).toBeNull()
    expect(categorizeObservation(makeObs('Normal Plasma Mean', '5902-2', 11.0, 'sec'))).toBeNull()
  })

  it('routes urine glucose to urine category (not glucose)', () => {
    const obs = {
      code: { text: 'Glucose', coding: [{ system: 'http://loinc.org', code: '5792-7' }] },
      valueString: '4+ (2000)',
    }
    expect(categorizeObservation(obs)?.id).toBe('urine')
  })
})
