// Audience/language-aware NHI order-name display.
//
// Report titles (panels / cultures / serology / imaging) come from the
// bridge's Chinese NHI 醫令名 because the source data carries no English. This
// helper swaps in a curated English name keyed by the stable order code for
// medical audience (and English UI), while keeping the Chinese for patient +
// zh-TW. These tests lock that contract: medical must never stay Chinese, and
// patient zh-TW must never get the order code's English silently.

import {
  getOrderNameDisplay,
  NHI_ORDER_CODE_TO_EN,
  NHI_ORDER_CODE_TO_ZH,
} from '@/src/shared/utils/nhi-order-names'

const ZH = '尿生化檢查(包括蛋白、糖…)' // bridge code.text fallback

describe('getOrderNameDisplay', () => {
  it('medical audience always shows English regardless of UI language', () => {
    expect(getOrderNameDisplay('06013C', ZH, 'medical', 'zh-TW')).toBe('Urinalysis, biochemistry')
    expect(getOrderNameDisplay('06013C', ZH, 'medical', 'en')).toBe('Urinalysis, biochemistry')
  })

  it('patient zh-TW shows the official 健保中文名 from the curated map (matches 健康存摺)', () => {
    // The official NHI name takes priority over whatever the bridge happened to
    // put in code.text, so every lab shows the one name the patient sees in
    // their 健康存摺 — even when that DR arrived with an abbreviated/English text.
    expect(getOrderNameDisplay('06013C', ZH, 'patient', 'zh-TW')).toBe(
      '尿生化檢查(包括蛋白、糖、尿膽元、膽紅素、比重、顏色、混濁度、酸鹼度、白血球酯脢及酮體)',
    )
    expect(getOrderNameDisplay('09025C', 'SGOT (AST)', 'patient', 'zh-TW')).toBe(
      '血清麩胺酸苯醋酸轉氨基脢',
    )
  })

  it('patient audience shows English in English UI', () => {
    expect(getOrderNameDisplay('06013C', ZH, 'patient', 'en')).toBe('Urinalysis, biochemistry')
  })

  it('unmapped order code falls back to the bridge text (surfaces coverage gaps)', () => {
    expect(getOrderNameDisplay('99999X', ZH, 'medical', 'zh-TW')).toBe(ZH)
    // ...including in patient zh-TW, where there is no official name to swap in.
    expect(getOrderNameDisplay('99999X', ZH, 'patient', 'zh-TW')).toBe(ZH)
  })

  it('missing order code falls back to the bridge text', () => {
    expect(getOrderNameDisplay(undefined, ZH, 'medical', 'en')).toBe(ZH)
    expect(getOrderNameDisplay(null, ZH, 'medical', 'en')).toBe(ZH)
    expect(getOrderNameDisplay(undefined, ZH, 'patient', 'zh-TW')).toBe(ZH)
  })

  it('normalises the bridge inconsistency for single-analyte codes', () => {
    // 08003C arrives as both "Hb" and "血色素檢查"; the map gives one English name.
    expect(getOrderNameDisplay('08003C', 'Hb', 'medical', 'zh-TW')).toBe('Hemoglobin (Hb)')
    expect(getOrderNameDisplay('08003C', '血色素檢查', 'medical', 'zh-TW')).toBe('Hemoglobin (Hb)')
  })

  it('covers imaging/procedure HIS-local-report codes', () => {
    expect(NHI_ORDER_CODE_TO_EN['18001C']).toBe('Electrocardiogram (ECG)')
    expect(NHI_ORDER_CODE_TO_EN['33072B']).toBe('CT, with/without contrast')
  })

  it('official zh map carries the formal 健保醫令中文名 for common analytes', () => {
    // Locks the names the patient sees in 健康存摺. If a value drifts, the
    // patient row would stop matching their official record.
    expect(NHI_ORDER_CODE_TO_ZH['09025C']).toBe('血清麩胺酸苯醋酸轉氨基脢')
    expect(NHI_ORDER_CODE_TO_ZH['09026C']).toBe('血清麩胺酸丙酮酸轉氨基脢')
    expect(NHI_ORDER_CODE_TO_ZH['08011C']).toBe('全套血液檢查I(八項)')
    expect(NHI_ORDER_CODE_TO_ZH['09021C']).toBe('鈉')
    expect(NHI_ORDER_CODE_TO_ZH['09022C']).toBe('鉀')
  })
})
