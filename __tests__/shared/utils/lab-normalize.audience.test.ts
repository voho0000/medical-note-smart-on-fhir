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
  getAnalyteDisplayParts,
  getAnalyteDisplayForObs,
  getAnalyteCanonicalKey,
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
    // Patient zh-TW appends the English short code in parens so the
    // all-Chinese name stays recognisable (e.g. 麩丙轉胺脢 (ALT)).
    // Patient en keeps the long form alone (already English).
    it.each([
      ['WBC', 'zh-TW', '白血球計數 (WBC)'],
      ['WBC', 'en', 'White blood cell count'],
      ['NA', 'zh-TW', '鈉 (NA)'],
      ['NA', 'en', 'Sodium'],
      ['ALT', 'zh-TW', '麩丙轉胺脢 (ALT)'],
      ['ALT', 'en', 'Alanine aminotransferase'],
      ['HBSAG', 'zh-TW', 'B 型肝炎表面抗原 (HBSAG)'],
      ['ANTI-HCV', 'en', 'Hepatitis C antibody'],
    ] as const)('%s + %s → %s', (canonical, lang, expected) => {
      expect(getAnalyteDisplayLabel(canonical, 'patient', lang)).toBe(expected)
    })

    it('does not double-append when lay name already bakes in the code', () => {
      // CA-199 / EGFR(EPI) / FIB-4 already carry a parenthetical code in
      // their lay-zh string — the guard must not produce "(CA-199) (CA-199)".
      expect(getAnalyteDisplayLabel('CA-199', 'patient', 'zh-TW')).toBe('醣蛋白 199 (CA-199)')
      expect(getAnalyteDisplayLabel('EGFR(EPI)', 'patient', 'zh-TW')).toBe('腎絲球過濾率 (CKD-EPI)')
      expect(getAnalyteDisplayLabel('FIB-4', 'patient', 'zh-TW')).toBe('肝纖維化指數 (FIB-4)')
    })

    it('does not append the English code in patient en mode', () => {
      // en lay names are already English; no parenthetical suffix.
      expect(getAnalyteDisplayLabel('WBC', 'patient', 'en')).toBe('White blood cell count')
      expect(getAnalyteDisplayLabel('ALT', 'patient', 'en')).toBe('Alanine aminotransferase')
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
      expect(getAnalyteDisplayLabel('HBA1C', 'patient', 'zh-TW')).toBe('糖化血色素 (HbA1c)')
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

describe('getAnalyteDisplayParts', () => {
  // Splits the display into a primary NAME + optional parenthetical ABBR so
  // cumulative-report headers can render them on two lines. Joining the parts
  // as `${name} (${abbr})` must reproduce getAnalyteDisplayLabel exactly.
  it('medical: name = short code, no abbr', () => {
    expect(getAnalyteDisplayParts('HB', 'medical', 'zh-TW')).toEqual({ name: 'HB', abbr: null })
    expect(getAnalyteDisplayParts('HBA1C', 'medical', 'zh-TW')).toEqual({ name: 'HbA1c', abbr: null })
  })

  it('patient zh-TW: Chinese name + English short code as abbr', () => {
    expect(getAnalyteDisplayParts('WBC', 'patient', 'zh-TW')).toEqual({ name: '白血球計數', abbr: 'WBC' })
    expect(getAnalyteDisplayParts('HB', 'patient', 'zh-TW')).toEqual({ name: '血色素', abbr: 'HB' })
    expect(getAnalyteDisplayParts('HBA1C', 'patient', 'zh-TW')).toEqual({ name: '糖化血色素', abbr: 'HbA1c' })
  })

  it('patient zh-TW: no separate abbr when lay name already bakes in a paren', () => {
    expect(getAnalyteDisplayParts('FIB-4', 'patient', 'zh-TW')).toEqual({ name: '肝纖維化指數 (FIB-4)', abbr: null })
  })

  it('patient en: long form name, no abbr (matches current single-line behaviour)', () => {
    expect(getAnalyteDisplayParts('WBC', 'patient', 'en')).toEqual({ name: 'White blood cell count', abbr: null })
  })

  it('no lay translation: falls back to short code, no abbr', () => {
    expect(getAnalyteDisplayParts('FAKE-ANALYTE', 'patient', 'zh-TW')).toEqual({ name: 'FAKE-ANALYTE', abbr: null })
  })

  it('join(parts) === getAnalyteDisplayLabel for every audience/language', () => {
    const keys = ['WBC', 'HB', 'HBA1C', 'ALT', 'FIB-4', 'WBC', 'FAKE-ANALYTE']
    const combos: Array<['medical' | 'patient', 'zh-TW' | 'en']> = [
      ['medical', 'zh-TW'], ['medical', 'en'], ['patient', 'zh-TW'], ['patient', 'en'],
    ]
    for (const k of keys) {
      for (const [aud, lang] of combos) {
        const { name, abbr } = getAnalyteDisplayParts(k, aud, lang)
        const joined = abbr ? `${name} (${abbr})` : name
        expect(joined).toBe(getAnalyteDisplayLabel(k, aud, lang))
      }
    }
  })
})

describe('getAnalyteDisplayForObs', () => {
  it('resolves LOINC-tagged obs through full pipeline', () => {
    const obs = { code: { coding: [{ system: 'LOINC', code: '6690-2' }] } }
    expect(getAnalyteDisplayForObs(obs, 'medical', 'zh-TW')).toBe('WBC')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'zh-TW')).toBe('白血球計數 (WBC)')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'en')).toBe('White blood cell count')
  })

  it('resolves Chinese-text obs (no LOINC) via TEST_ALIASES', () => {
    // Mirrors the long庚嘉義 bridge data shape: bare Chinese in code.text,
    // no LOINC. canonicalKeyFromLoinc returns null → falls to text alias →
    // 白血球計數 → WBC canonical → audience swap applies.
    const obs = { code: { text: '白血球計數' } }
    expect(getAnalyteDisplayForObs(obs, 'medical', 'zh-TW')).toBe('WBC')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'zh-TW')).toBe('白血球計數 (WBC)')
    expect(getAnalyteDisplayForObs(obs, 'patient', 'en')).toBe('White blood cell count')
  })

  it('applies the lay name for analytes with a mixed-case display override', () => {
    // Regression: getAnalyteDisplayForObs used to call getAnalyteLabel (returns
    // 'HbA1c') then CANONICAL_KEYS.has('HbA1c') === false, so it returned the
    // raw 'HbA1c' instead of the patient lay name. Resolving the KEY fixes it.
    const hba1c = { code: { coding: [{ system: 'http://loinc.org', code: '4548-4' }] } }
    expect(getAnalyteDisplayForObs(hba1c, 'medical', 'zh-TW')).toBe('HbA1c')
    expect(getAnalyteDisplayForObs(hba1c, 'patient', 'zh-TW')).toBe('糖化血色素 (HbA1c)')
    expect(getAnalyteDisplayForObs(hba1c, 'patient', 'en')).toBe('Glycated hemoglobin (HbA1c)')
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

  describe('no-LOINC, non-canonical lab fallback (bridge v0.17.4 shape)', () => {
    // Bridge v0.17.4 ships an extra his-local-lab coding (the hospital's
    // assaY_ITEM_NAME, usually English) for labs that have no LOINC. Without
    // a language-aware picker, the legacy `code.text || coding[0].display`
    // fallback would return the NHI 中文 in code.text and English mode would
    // still show Chinese. These tests lock the picker contract.
    const aTG = {
      code: {
        text: '甲狀腺球蛋白抗體',
        coding: [
          {
            system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
            code: '12068C',
            display: '甲狀腺球蛋白抗體',
          },
          {
            system: 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab',
            code: 'aTG, (Thyroglobulin Ab)',
            display: 'aTG, (Thyroglobulin Ab)',
          },
        ],
      },
    }

    it('English mode prefers the his-local-lab English display over NHI Chinese', () => {
      // The actual bug from the 2026-06-08 bridge discussion: 12068C aTG
      // showed 「甲狀腺球蛋白抗體」 in English mode because code.text won.
      expect(getAnalyteDisplayForObs(aTG, 'medical', 'en')).toBe('aTG, (Thyroglobulin Ab)')
      expect(getAnalyteDisplayForObs(aTG, 'patient', 'en')).toBe('aTG, (Thyroglobulin Ab)')
    })

    it('Chinese mode keeps the NHI 中文 from code.text', () => {
      expect(getAnalyteDisplayForObs(aTG, 'medical', 'zh-TW')).toBe('甲狀腺球蛋白抗體')
      expect(getAnalyteDisplayForObs(aTG, 'patient', 'zh-TW')).toBe('甲狀腺球蛋白抗體')
    })

    it('English mode prefers LOINC display when present, over his-local-lab', () => {
      // Defensive: if the bridge ever attaches BOTH a LOINC coding (English
      // long name) AND a his-local-lab coding, prefer the LOINC display
      // because LOINC is the canonical English source.
      const both = {
        code: {
          text: '某中文檢驗',
          coding: [
            { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', display: '某中文檢驗' },
            { system: 'http://loinc.org', code: '99999-9', display: 'Some LOINC display' },
            { system: 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab', display: 'SomeLocal' },
          ],
        },
      }
      expect(getAnalyteDisplayForObs(both, 'medical', 'en')).toBe('Some LOINC display')
    })

    it('English mode keeps Chinese his-local-lab as last resort, never blanks the row', () => {
      // Boundary the user explicitly called out: assaY_ITEM_NAME is hospital
      // free text and a few legacy entries (e.g. some CMV serology) are
      // themselves Chinese. CJK check skips them; we fall back to code.text
      // — surfacing the bug-visible Chinese name rather than displaying '—'.
      const chineseLocal = {
        code: {
          text: 'CMV 抗體',
          coding: [
            { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', display: 'CMV 抗體' },
            { system: 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab', display: '巨細胞病毒抗體' },
          ],
        },
      }
      // Both displays are CJK → no English option exists → fall back to
      // code.text. The label IS Chinese in English mode, intentionally —
      // we don't fabricate an English string we don't have.
      expect(getAnalyteDisplayForObs(chineseLocal, 'patient', 'en')).toBe('CMV 抗體')
    })

    it('English mode falls back to any non-CJK coding.display when system is unknown', () => {
      // Defensive against bridge URL drift: even if the system URL changes
      // and `his-local-lab` no longer matches, we still pick a non-CJK
      // display from the coding list before defaulting to code.text.
      const unknownSystem = {
        code: {
          text: '某檢驗',
          coding: [
            { system: 'urn:oid:1.2.3.4', display: 'SomeEnglishName' },
          ],
        },
      }
      expect(getAnalyteDisplayForObs(unknownSystem, 'patient', 'en')).toBe('SomeEnglishName')
    })
  })

  it('handles null/empty obs gracefully', () => {
    expect(getAnalyteDisplayForObs(null, 'patient', 'zh-TW')).toBe('—')
    expect(getAnalyteDisplayForObs(undefined, 'patient', 'en')).toBe('—')
    expect(getAnalyteDisplayForObs({}, 'patient', 'zh-TW')).toBe('—')
  })
})

describe('getAnalyteCanonicalKey', () => {
  // This helper exists to fix a subtle bug: getAnalyteLabel returns the
  // mixed-case DISPLAY form ('HbA1c', 'IgG') for analytes with a
  // CANONICAL_DISPLAY override, and those strings are NOT members of
  // CANONICAL_KEYS (which holds the uppercase keys 'HBA1C', 'IGG'). Anyone
  // who calls getAnalyteLabel then feeds the result back into a canonical-keyed
  // map (getAnalyteDisplayLabel etc.) silently misses for those analytes —
  // the patient lay-name path never fires. getAnalyteCanonicalKey returns the
  // raw uppercase KEY so that round-trip works.
  it('returns the UPPERCASE key for analytes with a mixed-case display override', () => {
    // HbA1c via LOINC 4548-4. getAnalyteLabel would return 'HbA1c'; the key is 'HBA1C'.
    const hba1c = { code: { coding: [{ system: 'http://loinc.org', code: '4548-4' }] } }
    expect(getAnalyteCanonicalKey(hba1c)).toBe('HBA1C')
  })

  it('returns the key for ordinary analytes (no display override)', () => {
    const wbc = { code: { coding: [{ system: 'http://loinc.org', code: '6690-2' }] } }
    expect(getAnalyteCanonicalKey(wbc)).toBe('WBC')
  })

  it('resolves Chinese-text obs without LOINC via text alias', () => {
    expect(getAnalyteCanonicalKey({ code: { text: '白血球計數' } })).toBe('WBC')
  })

  it('returns null for non-canonical obs (cultures, free-text)', () => {
    expect(getAnalyteCanonicalKey({ code: { text: 'Aerobic culture, Sputum' } })).toBeNull()
  })

  it('returns null for null/empty obs', () => {
    expect(getAnalyteCanonicalKey(null)).toBeNull()
    expect(getAnalyteCanonicalKey(undefined)).toBeNull()
    expect(getAnalyteCanonicalKey({})).toBeNull()
  })

  it('round-trips through getAnalyteDisplayLabel — the actual title-bug fix', () => {
    // This is the exact flow useReportsData runs for a single-obs HbA1c DR:
    // resolve the key, then ask for the audience/language display label.
    const hba1c = { code: { coding: [{ system: 'http://loinc.org', code: '4548-4' }] } }
    const key = getAnalyteCanonicalKey(hba1c)!
    expect(getAnalyteDisplayLabel(key, 'patient', 'zh-TW')).toBe('糖化血色素 (HbA1c)')
    expect(getAnalyteDisplayLabel(key, 'medical', 'zh-TW')).toBe('HbA1c')
  })
})
