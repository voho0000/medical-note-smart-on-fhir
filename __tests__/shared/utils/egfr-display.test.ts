// eGFR: CKD-EPI vs MDRD must be DISTINCT canonical keys (so a hospital that
// uploads both doesn't collapse them into one row/trend), and the per-obs
// display must show the health record's OWN name — never a formula the app
// inferred. Bridge NHI-FHIR-Bridge v1.3.2 emits distinct LOINCs; older bundles
// carry the method only in code.text.

import {
  getAnalyteLabel,
  getAnalyteCanonicalKey,
  getAnalyteDisplayForObs,
  getAnalyteDisplayLabel,
} from '@/src/shared/utils/lab-normalize'

const loincObs = (text: string, loinc: string): any => ({
  code: { text, coding: [{ system: 'http://loinc.org', code: loinc }] },
  valueQuantity: { value: 32, unit: 'mL/min/1.73m2' },
})
const textObs = (text: string): any => ({ code: { text, coding: [] } })

describe('eGFR canonical keys (dual-formula split)', () => {
  it('resolves the v1.3.2 method LOINCs to distinct keys', () => {
    expect(getAnalyteCanonicalKey(loincObs('eGFR (CKD-EPI)', '62238-1'))).toBe('EGFR(EPI)')
    expect(getAnalyteCanonicalKey(loincObs('eGFR (MDRD)', '77147-7'))).toBe('EGFR(M)')
  })

  it('keeps the legacy 33914-3 resolving to MDRD (cached/old bundles)', () => {
    expect(getAnalyteCanonicalKey(loincObs('Estimated GFR', '33914-3'))).toBe('EGFR(M)')
  })

  it('splits by code.text method token when no distinct LOINC is present', () => {
    expect(getAnalyteCanonicalKey(textObs('eGFR (CKD-EPI)'))).toBe('EGFR(EPI)')
    expect(getAnalyteCanonicalKey(textObs('eGFR (MDRD)'))).toBe('EGFR(M)')
  })

  it('routes bare eGFR (no formula, no LOINC) to the MDRD key by convention', () => {
    // …so it shares the cumulative column with LOINC data instead of spawning
    // a separate bare-EGFR column.
    expect(getAnalyteCanonicalKey(textObs('eGFR'))).toBe('EGFR(M)')
    expect(getAnalyteCanonicalKey(textObs('Estimated GFR'))).toBe('EGFR(M)')
  })

  it('CKD-EPI and MDRD drawn the same day are different keys → two pivot rows', () => {
    const epi = getAnalyteLabel(loincObs('eGFR (CKD-EPI)', '62238-1'))
    const mdrd = getAnalyteLabel(loincObs('eGFR', '77147-7'))
    expect(epi).not.toBe(mdrd)
  })
})

describe('eGFR display fidelity (per-obs render path)', () => {
  it('patient zh-TW keeps the Chinese stem and shows the SOURCE name in parens', () => {
    // Not "腎絲球過濾率 (MDRD)" — the record said "eGFR", so print that.
    expect(getAnalyteDisplayForObs(loincObs('eGFR', '33914-3'), 'patient', 'zh-TW')).toBe('腎絲球過濾率 (eGFR)')
    expect(getAnalyteDisplayForObs(loincObs('Estimated GFR', '33914-3'), 'patient', 'zh-TW')).toBe('腎絲球過濾率 (Estimated GFR)')
  })

  it('never fabricates "(MDRD)" for a bare-eGFR source', () => {
    const patient = getAnalyteDisplayForObs(loincObs('eGFR', '33914-3'), 'patient', 'zh-TW')
    const medical = getAnalyteDisplayForObs(loincObs('eGFR', '33914-3'), 'medical', 'zh-TW')
    expect(patient).not.toMatch(/MDRD/)
    expect(medical).not.toMatch(/MDRD/)
  })

  it('medical shows the lab’s own label verbatim', () => {
    expect(getAnalyteDisplayForObs(loincObs('eGFR', '33914-3'), 'medical', 'en')).toBe('eGFR')
    expect(getAnalyteDisplayForObs(loincObs('Estimated GFR', '33914-3'), 'medical', 'en')).toBe('Estimated GFR')
  })

  it('a source that DOES state the method shows it faithfully (both directions)', () => {
    expect(getAnalyteDisplayForObs(loincObs('eGFR (CKD-EPI)', '62238-1'), 'medical', 'en')).toBe('eGFR (CKD-EPI)')
  })
})

describe('cumulative-report column label (key-based, getAnalyteDisplayLabel)', () => {
  it('MDRD/bare column shows the faithful 中文(eGFR) name, never "(MDRD)"', () => {
    const label = getAnalyteDisplayLabel('EGFR(M)', 'patient', 'zh-TW')
    expect(label).toBe('腎絲球過濾率 (eGFR)')
    expect(label).not.toMatch(/MDRD/)
  })

  it('CKD-EPI column keeps its formula suffix (source stated it; disambiguates)', () => {
    expect(getAnalyteDisplayLabel('EGFR(EPI)', 'patient', 'zh-TW')).toBe('腎絲球過濾率 (CKD-EPI)')
  })
})
