// Regression tests for canonical-key resolution. The cumulative report
// (累積報告) groups Observations into columns by canonical key, so any
// failure to collapse a same-analyte variant into the same key produces
// a visible duplicate column next to its pinnedColumn stub.
//
// Bug history (v0.11.10 audit, 2026-05-29):
//   Bridge passes through whatever display name the source EHR sent —
//   some hospitals emit pure Chinese names ("嗜中性白血球") while others
//   emit English short codes ("Segment"). Both carried LOINC 770-8 but
//   neither LOINC nor display-text resolved to "NEU", so the report
//   showed: NEU(empty pinned column) │ 嗜中性白血球 │ Segment.
//
// We intentionally use display-text aliases (not LOINC mappings) so that
// bridge mis-tags — e.g. a band-form row tagged with LOINC 770-8 — stay
// in their own column and remain visible as bridge bugs.
import { canonicalTestKeyFromString, getAnalyteLabel } from '@/src/shared/utils/lab-normalize'

describe('canonicalTestKeyFromString — Chinese display-name aliases', () => {
  describe('CBC differential cells', () => {
    it.each([
      ['嗜中性白血球', 'NEU'],
      ['帶狀嗜中性白血球', 'BAND'],
      ['淋巴球', 'LYM'],
      ['單核球', 'MONO'],
      ['嗜伊紅性白血球', 'EOS'],
      ['嗜酸性白血球', 'EOS'],
      ['嗜鹼性白血球', 'BASO'],
      ['後骨髓球', 'META-MYELOCYTE'],
      ['Meta-Myelocyte', 'META-MYELOCYTE'],
    ])('%s → %s', (input, expected) => {
      expect(canonicalTestKeyFromString(input)).toBe(expected)
    })
  })

  describe('CBC counts and RBC indices', () => {
    it.each([
      ['白血球計數', 'WBC'],
      ['紅血球計數', 'RBC'],
      ['血色素檢查', 'HB'],
      ['血球比容值測定', 'HCT'],
      ['血小板計數', 'PLT'],
      ['紅血球平均容積', 'MCV'],
      ['紅血球色素', 'MCH'],
      ['紅血球色素濃度', 'MCHC'],
      ['紅血球分佈變異數', 'RDW'],
    ])('%s → %s', (input, expected) => {
      expect(canonicalTestKeyFromString(input)).toBe(expected)
    })
  })

  describe('Chemistry — alternative Chinese spellings', () => {
    it.each([
      ['全膽紅素', 'T.BILI'],
      ['膽紅素總量', 'T.BILI'],
      ['肌酐', 'CREA'],
      ['肌酸酐', 'CREA'],
      ['肌酸酐、血', 'CREA'],
      ['乳酸', 'LACTATE'],
    ])('%s → %s', (input, expected) => {
      expect(canonicalTestKeyFromString(input)).toBe(expected)
    })
  })

  describe('English short codes (existing — sanity check)', () => {
    it.each([
      ['Segment', 'NEU'],
      ['Neutrophil', 'NEU'],
      ['Lymphocyte', 'LYM'],
      ['Hb', 'HB'],
      ['HCT', 'HCT'],
      ['MCH', 'MCH'],
      ['MCV', 'MCV'],
    ])('%s → %s', (input, expected) => {
      expect(canonicalTestKeyFromString(input)).toBe(expected)
    })
  })

  // ── Safety: don't mask bridge LOINC mis-tagging ─────────────────────────
  // Bridge v0.11.9/v0.11.10 sometimes attaches LOINC 770-8 (Neutrophils
  // automated) to a band-form row (display "帶狀嗜中性白血球"). We resolve
  // the column by DISPLAY TEXT, not LOINC, so the mislabeled band row
  // stays in BAND and never silently joins NEU. This keeps bridge Bug 6
  // (v0.11.9 report) visible in the cumulative report.
  describe('does NOT mask bridge LOINC mis-tags', () => {
    it('帶狀嗜中性白血球 resolves to BAND (independent of LOINC)', () => {
      expect(canonicalTestKeyFromString('帶狀嗜中性白血球')).toBe('BAND')
      // Other neutrophil texts still go to NEU
      expect(canonicalTestKeyFromString('嗜中性白血球')).toBe('NEU')
      expect(canonicalTestKeyFromString('Segment')).toBe('NEU')
    })
  })

  // ── APTT seconds vs APTT ratio (v0.11.10 audit) ─────────────────────────
  // Bridge sends two distinct obs with NHI 醫令碼 08036C: APTT in seconds
  // (LOINC 14979-9, value 31.4 sec) and APTT ratio (LOINC 63561-5,
  // "aPTT --actual/normal", value 1.08 {ratio}). Before this fix both
  // collapsed to the same APTT row in the pivot — last-write-wins clobbered
  // the seconds value with the ratio, so the APTT column showed 1.08
  // {ratio} even though clinical convention is seconds. The split alias
  // keeps APTT (sec) and APTT-RATIO in separate columns.
  describe('APTT seconds / APTT ratio split', () => {
    it('plain "APTT" resolves to APTT (seconds, LOINC 14979-9 case)', () => {
      expect(canonicalTestKeyFromString('APTT')).toBe('APTT')
    })
    it('"APTT (ratio)" resolves to APTT-RATIO (LOINC 63561-5 case)', () => {
      expect(canonicalTestKeyFromString('APTT (ratio)')).toBe('APTT-RATIO')
      expect(canonicalTestKeyFromString('APTT (RATIO)')).toBe('APTT-RATIO')
    })
  })
})

describe('CANONICAL_KEYS — column-header eligibility', () => {
  // Each test key here is something the pivot WILL render as a column
  // header verbatim. Adding to TEST_ALIASES values automatically grows
  // this set, but the regression test pins the contract so a future
  // refactor that drops the spread is caught.
  const { CANONICAL_KEYS } = jest.requireActual<
    typeof import('@/src/shared/utils/lab-normalize')
  >('@/src/shared/utils/lab-normalize')

  it.each(['NEU', 'LYM', 'MONO', 'EOS', 'BASO', 'BAND', 'WBC', 'RBC',
           'HB', 'HCT', 'PLT', 'MCV', 'MCH', 'MCHC', 'RDW',
           'PT', 'APTT', 'APTT-RATIO', 'INR', 'D-DIMER',
           'GLUCOSE-AC', 'GLUCOSE-FS', 'GLUCOSE'])('%s is canonical', (key) => {
    expect(CANONICAL_KEYS.has(key)).toBe(true)
  })
})

describe('CANONICAL_DISPLAY — pretty column headers', () => {
  const { CANONICAL_DISPLAY } = jest.requireActual<
    typeof import('@/src/shared/utils/lab-normalize')
  >('@/src/shared/utils/lab-normalize')

  it('APTT-RATIO displays as "APTT-ratio"', () => {
    expect(CANONICAL_DISPLAY['APTT-RATIO']).toBe('APTT-ratio')
  })
})

// ── getAnalyteLabel — display-label resolution for per-visit accordion ──
// User complaint (2026-05-29): "為什麼累積報告生化會出現乳酸不是應該要是
// lactate嗎"; follow-up: "Na 你現在都顯示鈉". Cumulative-report column
// headers were already canonicalised via buildTestEntry, but the per-visit
// ObservationBlock accordion and single-obs DR titles still rendered
// obs.code.text directly — so bridge-emitted Chinese names (鈉 / 鉀 / 乳酸)
// leaked through to the UI. getAnalyteLabel centralises the resolution
// so every code path agrees with the cumulative-report header.
describe('getAnalyteLabel', () => {
  function obs(text: string, loinc?: string) {
    return {
      code: {
        text,
        coding: loinc ? [{ system: 'http://loinc.org', code: loinc }] : [],
      },
    }
  }

  describe('LOINC-canonical analytes show English short code', () => {
    it.each([
      // Bridge sends Chinese text + correct LOINC — most common case
      ['鈉', '2951-2', 'NA'],
      ['鉀', '2823-3', 'K'],
      ['鈣', '17861-6', 'CA'],
      ['磷', '2777-1', 'IP'],
      ['白蛋白', '1751-7', 'ALB'],
      ['血中尿素氮', '3094-0', 'BUN'],
      ['肌酐(血液)', '2160-0', 'CREA'],
      ['尿酸', '3084-1', 'UA'],
    ])('text=%s LOINC=%s → %s', (text, loinc, expected) => {
      expect(getAnalyteLabel(obs(text, loinc))).toBe(expected)
    })
  })

  describe('text-alias analytes (no LOINC mapping yet) show canonical key', () => {
    it.each([
      // Chinese-name alias (Lactate LOINC 14118-4 not in LOINC_TO_CANONICAL —
      // text alias '乳酸' → LACTATE fills the gap)
      ['乳酸', '14118-4', 'LACTATE'],
      // CBC differentials via Chinese text aliases (no LOINC needed in map)
      ['嗜中性白血球', undefined, 'NEU'],
      ['淋巴球', undefined, 'LYM'],
      ['Segment', undefined, 'NEU'],
    ])('text=%s LOINC=%s → %s', (text, loinc, expected) => {
      expect(getAnalyteLabel(obs(text, loinc))).toBe(expected)
    })
  })

  describe('non-canonical rows fall back to raw text (no over-translation)', () => {
    it.each([
      // Microbiology / antibiotic susceptibility — keep bridge label verbatim
      ['抗酸菌培養', '13026C', '抗酸菌培養'],
      ['ORDINARY CULTURE-A testcode', undefined, 'ORDINARY CULTURE-A testcode'],
      // Unknown analyte with no LOINC and no alias — keep raw
      ['免疫電泳分析', undefined, '免疫電泳分析'],
    ])('text=%s → %s (unchanged)', (text, loinc, expected) => {
      expect(getAnalyteLabel(obs(text, loinc))).toBe(expected)
    })
  })

  it('returns "—" for undefined / missing code', () => {
    expect(getAnalyteLabel(undefined)).toBe('—')
    expect(getAnalyteLabel({})).toBe('—')
  })

  it('safety: bridge mis-tag (band row with NEU LOINC) keeps BAND label', () => {
    // v0.11.9 Bug 6 scenario — bridge sometimes tags a band-form row with
    // the neutrophil LOINC (770-8). Our strategy is to keep these visible
    // by NOT adding 770-8 to LOINC_TO_CANONICAL — so the helper falls
    // through to the display-text alias '帶狀嗜中性白血球' → BAND. Mis-tag
    // stays visible as its own row instead of silently merging into NEU.
    expect(getAnalyteLabel(obs('帶狀嗜中性白血球', '770-8'))).toBe('BAND')
    // Without the mis-tag (no LOINC at all), same outcome via text alias.
    expect(getAnalyteLabel(obs('帶狀嗜中性白血球'))).toBe('BAND')
  })
})
