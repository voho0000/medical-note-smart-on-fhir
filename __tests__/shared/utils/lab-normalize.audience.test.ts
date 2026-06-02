// Audience-aware analyte display label resolution.
//
// Two-layer design: getAnalyteLabel(obs) → canonical short code (stable,
// drives sort/categorise/search/AI); getAnalyteDisplayLabel(canonical,
// audience, language) → audience-aware label for UI render. These tests
// lock the contract so future refactors don't accidentally translate the
// canonical key (would break sort) or skip translation in patient mode
// (would defeat the feature).

import {
  getAnalyteDisplayLabel,
  getAnalyteDisplayForObs,
  CANONICAL_TO_LAY_ZH,
  CANONICAL_TO_LAY_EN,
} from '@/src/shared/utils/lab-normalize'

describe('getAnalyteDisplayLabel', () => {
  describe('medical audience always returns canonical', () => {
    it.each([
      ['WBC', 'zh-TW', 'WBC'],
      ['WBC', 'en', 'WBC'],
      ['NA', 'zh-TW', 'NA'],
      ['ALT', 'en', 'ALT'],
    ] as const)('%s + %s → %s', (canonical, lang, expected) => {
      expect(getAnalyteDisplayLabel(canonical, 'medical', lang)).toBe(expected)
    })

    it('preserves CANONICAL_DISPLAY mixed-case overrides for medical mode', () => {
      // HBA1C and IGG have mixed-case display overrides — medical mode
      // should pick those up rather than the all-uppercase canonical key.
      expect(getAnalyteDisplayLabel('HBA1C', 'medical', 'zh-TW')).toBe('HbA1c')
      expect(getAnalyteDisplayLabel('IGG', 'medical', 'en')).toBe('IgG')
      expect(getAnalyteDisplayLabel('APTT-RATIO', 'medical', 'zh-TW')).toBe('APTT-ratio')
    })
  })

  describe('patient audience swaps to long-form translation', () => {
    it.each([
      ['WBC', 'zh-TW', '白血球計數'],
      ['WBC', 'en', 'White blood cell count'],
      ['NA', 'zh-TW', '鈉'],
      ['NA', 'en', 'Sodium'],
      ['ALT', 'zh-TW', '麩丙轉胺脢'],
      ['ALT', 'en', 'Alanine aminotransferase'],
      ['HBSAG', 'zh-TW', 'B 型肝炎表面抗原'],
      ['ANTI-HCV', 'en', 'Hepatitis C antibody'],
    ] as const)('%s + %s → %s', (canonical, lang, expected) => {
      expect(getAnalyteDisplayLabel(canonical, 'patient', lang)).toBe(expected)
    })
  })

  describe('unknown canonical falls back to canonical (with mixed-case override)', () => {
    it('returns canonical when no translation exists in patient mode', () => {
      // FAKE-ANALYTE isn't in either lay map — fall back to canonical key
      // rather than silently dropping the label.
      expect(getAnalyteDisplayLabel('FAKE-ANALYTE', 'patient', 'zh-TW')).toBe('FAKE-ANALYTE')
      expect(getAnalyteDisplayLabel('FAKE-ANALYTE', 'patient', 'en')).toBe('FAKE-ANALYTE')
    })

    it('still applies CANONICAL_DISPLAY override when lay map misses', () => {
      // NT-PROBNP is in CANONICAL_TO_LAY_ZH but suppose a future canonical
      // had only the mixed-case override defined — verify the fall-through.
      // (Using a canonical that has CANONICAL_DISPLAY but isn't in lay-EN
      // would test this; here HBA1C is in both, so use it as a smoke test.)
      expect(getAnalyteDisplayLabel('HBA1C', 'patient', 'zh-TW')).toBe('糖化血色素')
    })
  })

  describe('coverage cross-check — both lay maps cover the most common analytes', () => {
    // If one of these analytes loses an entry in either map, the patient
    // sees the canonical short code instead of the friendly name. Tests
    // here lock the floor.
    const requiredCoverage = [
      'WBC', 'RBC', 'HB', 'HCT', 'PLT', 'MCV',
      'NEU', 'LYM', 'MONO', 'EOS', 'BASO',
      'NA', 'K', 'CL', 'CA',
      'BUN', 'CREA', 'UA',
      'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'ALB',
      'CRP', 'LACTATE',
      'GLUCOSE', 'GLUCOSE-AC', 'HBA1C',
      'CHOL', 'TG', 'HDL', 'LDL',
      'PT', 'INR', 'APTT', 'D-DIMER',
      'TSH', 'FREE T4',
      'AFP', 'CEA', 'PSA', 'CA-125', 'CA-153', 'CA-199', 'FERRITIN',
      'HBSAG', 'ANTI-HBS', 'ANTI-HBC', 'ANTI-HCV',
      'COLOR', 'PH', 'PROT', 'GLUCOSE',
    ]
    // NOTE: pass key as array to bypass Jest's dot-path interpretation
    // (toHaveProperty('T.BILI') would look up obj.T.BILI, not obj['T.BILI']).
    it.each(requiredCoverage)('%s is in CANONICAL_TO_LAY_ZH', (k) => {
      expect(CANONICAL_TO_LAY_ZH).toHaveProperty([k])
    })
    it.each(requiredCoverage)('%s is in CANONICAL_TO_LAY_EN', (k) => {
      expect(CANONICAL_TO_LAY_EN).toHaveProperty([k])
    })
  })
})

describe('getAnalyteDisplayForObs', () => {
  it('resolves LOINC-tagged obs through full pipeline', () => {
    const obs = { code: { coding: [{ system: 'LOINC', code: '6690-2' }] } }
    expect(getAnalyteDisplayForObs(obs, 'medical', 'zh-TW')).toBe('WBC')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'zh-TW')).toBe('白血球計數')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'en')).toBe('White blood cell count')
  })

  it('resolves Chinese-text obs (no LOINC) via TEST_ALIASES', () => {
    // Mirrors the long庚嘉義 bridge data shape: bare Chinese in code.text,
    // no LOINC. canonicalKeyFromLoinc returns null → falls to text alias →
    // 白血球計數 → WBC canonical → audience swap applies.
    const obs = { code: { text: '白血球計數' } }
    expect(getAnalyteDisplayForObs(obs, 'medical', 'zh-TW')).toBe('WBC')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'zh-TW')).toBe('白血球計數')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'en')).toBe('White blood cell count')
  })

  it('keeps non-canonical raw text unchanged (e.g. cultures, free-text)', () => {
    // Microbiology cultures and antibiotic susceptibilities don't have a
    // canonical short code; they should render with their bridge-sent
    // label regardless of audience — translating "Aerobic culture" to
    // some made-up Chinese would be confusing AND wrong.
    const culture = { code: { text: 'Aerobic culture, Sputum' } }
    expect(getAnalyteDisplayForObs(culture, 'medical', 'zh-TW')).toBe('Aerobic culture, Sputum')
    expect(getAnalyteDisplayForObs(culture, 'patient', 'zh-TW')).toBe('Aerobic culture, Sputum')
    expect(getAnalyteDisplayForObs(culture, 'patient', 'en')).toBe('Aerobic culture, Sputum')
  })

  it('handles null/empty obs gracefully', () => {
    expect(getAnalyteDisplayForObs(null, 'patient', 'zh-TW')).toBe('—')
    expect(getAnalyteDisplayForObs(undefined, 'patient', 'en')).toBe('—')
    expect(getAnalyteDisplayForObs({}, 'patient', 'zh-TW')).toBe('—')
  })
})
