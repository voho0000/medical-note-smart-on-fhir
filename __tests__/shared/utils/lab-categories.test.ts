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
  CANONICAL_TO_CATEGORY,
  categorizeObservation,
  LAB_CATEGORIES,
} from '@/src/shared/utils/lab-categories'

const cbc = LAB_CATEGORIES.find((c) => c.id === 'cbc')!
const serology = LAB_CATEGORIES.find((c) => c.id === 'serology')!

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

  describe('immature/smear CBC rows seen in visit-history lists', () => {
    it.each(['Blast', 'Meta', 'Myelo.', 'Normobl.', 'PlasmaCell', 'Promyl.', 'PS', 'PS Auto DC'])(
      '%s with no LOINC still categorises as cbc',
      (text) => {
        const obs = { code: { text, coding: [] }, valueQuantity: { value: 0, unit: '%' } }
        expect(categorizeObservation(obs)?.id).toBe('cbc')
      },
    )

    it.each(['BLAST', 'META-MYELOCYTE', 'MYELOCYTE', 'NORMOBLAST', 'PLASMA-CELL', 'PROMYELOCYTE', 'PS'])(
      'canonical key %s maps back to cbc for visit-history grouping',
      (key) => {
        expect(CANONICAL_TO_CATEGORY.get(key)?.id).toBe('cbc')
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

describe('serology.pinnedColumns', () => {
  it('reserves viral antigen columns when the hidden tab is revealed with no data', () => {
    expect(serology.pinnedColumns).toEqual(['FLU-A-AG', 'FLU-B-AG', 'COVID-AG'])
  })
})

describe('categorizeObservation — chem analytes that used to fall to 其他', () => {
  // User report 2026-07-07: CO2 (total), Mg and NT-proBNP were landing in the
  // 其他 card because their LOINCs weren't in chem. They're canonical chemistry.
  describe('by LOINC (the bridge/real-data path)', () => {
    it.each([
      ['二氧化碳', '2028-9'],   // total CO2 / TCO2
      ['鎂', '19123-9'],        // magnesium
      ['NT-proBNP', '33762-6'], // heart-failure marker
    ])('%s (LOINC %s) categorises as chem', (text, loinc) => {
      expect(categorizeObservation(makeObs(text, loinc))?.id).toBe('chem')
    })
  })

  describe('by text when LOINC is absent (foreign-bundle fallback)', () => {
    it.each(['CO2', 'TCO2', 'Magnesium', 'Mg', 'NT-proBNP', 'proBNP'])(
      '%s with no LOINC still categorises as chem',
      (text) => {
        const obs = { code: { text, coding: [] }, valueQuantity: { value: 1, unit: 'x' } }
        expect(categorizeObservation(obs)?.id).toBe('chem')
      },
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

// ── TROP routing — added 2026-06-05 after a clinician reported it appearing
// outside 生化 in 就診紀錄 even though 累積報告 expected it there. Bridge
// emits cardiac Troponin I with LOINC 10839-9 and free text "Troponin I";
// both the LOINC and the canonical short code should land in `chem`.
describe('categorizeObservation — cardiac markers', () => {
  it('Troponin I LOINC 10839-9 → chem', () => {
    const obs = {
      code: {
        text: 'Troponin I',
        coding: [{ system: 'http://loinc.org', code: '10839-9' }],
      },
      valueQuantity: { value: 0.02, unit: 'ng/mL' },
      specimen: { display: 'Blood' },
    }
    expect(categorizeObservation(obs)?.id).toBe('chem')
  })

  it('short code TROP → chem', () => {
    const obs = {
      code: { text: 'TROP' },
      valueQuantity: { value: 0.02, unit: 'ng/mL' },
    }
    expect(categorizeObservation(obs)?.id).toBe('chem')
  })

  it('"Troponin I" / "Troponin T" display names → chem', () => {
    for (const display of ['Troponin I', 'Troponin T', 'TROPONIN']) {
      const obs = {
        code: { text: display },
        valueQuantity: { value: 0.02, unit: 'ng/mL' },
      }
      expect(categorizeObservation(obs)?.id).toBe('chem')
    }
  })
})

// ── NHI 醫令章節閘 (name-collision guard) ────────────────────────────────────
// Bug (NHI-FHIR-Bridge report 2026-06-29): 13006C 排泄物/分泌物之細菌顯微鏡檢查
// reports pus cells as "Neutrophil 1+(>25/LPF)" — NO LOINC, NO specimen — which
// used to mis-group into the blood CBC 嗜中性白血球 column because the name
// "Neutrophil" alias-resolves to NEU. The 08 (血液學) section gate keeps such a
// row out of cbc/coag, and the NHI-aware qualitative fallback stops the "1+"
// from then bouncing it into 尿液 — all without dropping legit CBC or uncoded data.
describe('categorizeObservation — NHI section gate (name-collision guard)', () => {
  const NHI = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'
  const HIS = 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab'

  // Mirrors how the bridge emits a no-LOINC NHI row: NHI medical-order code +
  // his-local name in code.text, no LOINC, no specimen.
  function nhiObs(
    text: string,
    nhiCode: string,
    opts: { loinc?: string; valueString?: string; value?: number } = {},
  ) {
    const coding: any[] = []
    if (opts.loinc) coding.push({ system: 'http://loinc.org', code: opts.loinc })
    coding.push({ system: NHI, code: nhiCode, display: text })
    coding.push({ system: HIS, code: text, display: text })
    const obs: any = { code: { text, coding } }
    if (opts.valueString !== undefined) obs.valueString = opts.valueString
    if (opts.value !== undefined) obs.valueQuantity = { value: opts.value, unit: '%' }
    return obs
  }

  it('microbiology "Neutrophil" (NHI 13006C, no LOINC/specimen, "1+(>25/LPF)") is excluded — not cbc, not urine', () => {
    expect(categorizeObservation(nhiObs('Neutrophil', '13006C', { valueString: '1+(>25/LPF)' }))).toBeNull()
  })

  it.each(['08013C', '08011C', '08002C', '08003C', '08006C'])(
    'CBC "Neutrophil" billed under NHI %s (08 血液學 section) still categorises as cbc',
    (nhi) => {
      expect(categorizeObservation(nhiObs('Neutrophil', nhi, { value: 48.9 }))?.id).toBe('cbc')
    },
  )

  it('"Neutrophil" with NO NHI code (non-NHI FHIR / sandbox) still categorises as cbc via the name fallback', () => {
    const obs = { code: { text: 'Neutrophil' }, valueQuantity: { value: 50, unit: '%' } }
    expect(categorizeObservation(obs)?.id).toBe('cbc')
  })

  it('CBC LOINC wins over the section gate (LOINC is not gated — bridge LOINC errors stay visible)', () => {
    // 57021-8 = CBC W Auto Diff panel (whitelisted in cbc.loincCodes); even with
    // an off-section NHI code riding along, Pass-2 LOINC resolves it to cbc.
    expect(categorizeObservation(nhiObs('Neutrophil', '13006C', { loinc: '57021-8', value: 50 }))?.id).toBe('cbc')
  })

  // ── Urine section gate (06) — same guard, "Bacteria" name collision ──────
  it('urinalysis "Bacteria" (NHI 06012C) categorises as urine', () => {
    expect(categorizeObservation(nhiObs('Bacteria', '06012C', { valueString: 'Few' }))?.id).toBe('urine')
  })

  it('microbiology "Bacteria" (NHI 13016B blood culture) does NOT ride into urine — excluded', () => {
    expect(categorizeObservation(nhiObs('Bacteria', '13016B', { valueString: 'Many' }))).toBeNull()
  })

  it('"Bacteria" with no NHI code still categorises as urine via the name fallback', () => {
    expect(categorizeObservation({ code: { text: 'Bacteria' }, valueString: 'Few' })?.id).toBe('urine')
  })
})
