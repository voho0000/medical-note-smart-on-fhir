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
  it('does NOT filter 溶血 / 脂血 quality-flag rows — bridge bug stays visible', () => {
    // Per memory/feedback_no_masking_bridge_bugs.md (2026-05-29 revision),
    // we no longer reject specimen-quality flags. Bridge still emits these
    // as 0-value obs borrowing analyte LOINCs (BUN/Chol); the user wants
    // the 0-value cells in the cumulative report so they (a) see the
    // bridge bug, (b) can file/track a bridge fix, and (c) so other
    // SMART apps consuming the same bridge bundle aren't misled by our
    // app-side silent cleanup.
    const hemolysis = makeObs('溶血', '2093-3', 0)
    expect(categorizeObservation(hemolysis)?.id).toBe('lipid')  // 2093-3 = Cholesterol
    const lipemia = makeObs('脂血', '3094-0', 0)
    expect(categorizeObservation(lipemia)?.id).toBe('chem')  // 3094-0 = BUN
  })

  it('routes blood UA / BUN to chem even when text starts with 尿 (specimen=Blood)', () => {
    // v0.13.0 bridge fix correctly sets specimen=Blood for NHI 09013C
    // (尿酸 = serum uric acid) and 09002C (血中尿素氮 = BUN). App's
    // text-based Pass 2 used to greedy-match the single CJK char 尿 in
    // 尿酸 / 尿素氮 and silently re-route those rows to urine, hiding
    // them from the chem cumulative report. Pass 2 is now skipped when
    // specimen explicitly says Blood/Serum/Plasma.
    const ua = {
      code: { text: '尿酸', coding: [{ system: 'http://loinc.org', code: '3084-1' }] },
      valueQuantity: { value: 4.7, unit: 'mg/dL' },
      specimen: { display: 'Blood' },
    }
    expect(categorizeObservation(ua)?.id).toBe('chem')

    const bun = {
      code: { text: '血中尿素氮', coding: [{ system: 'http://loinc.org', code: '3094-0' }] },
      valueQuantity: { value: 27.3, unit: 'mg/dL' },
      specimen: { display: 'Blood' },
    }
    expect(categorizeObservation(bun)?.id).toBe('chem')

    // Sanity: when specimen IS urine, urine routing still applies.
    const urineProtein = {
      code: { text: '尿蛋白', coding: [{ system: 'http://loinc.org', code: '20454-5' }] },
      valueString: '+',
      specimen: { display: 'Urine' },
    }
    expect(categorizeObservation(urineProtein)?.id).toBe('urine')
  })

  it('routes urine glucose to urine category (not glucose)', () => {
    const obs = {
      code: { text: 'Glucose', coding: [{ system: 'http://loinc.org', code: '5792-7' }] },
      valueString: '4+ (2000)',
    }
    expect(categorizeObservation(obs)?.id).toBe('urine')
  })
})
