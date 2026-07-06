import { resultToClipboardText, resultToFullClipboardText, isImplausible, coherenceSpan } from '@/features/medical-calculator/format'
import { CALCULATORS } from '@/features/medical-calculator/calculators'
import type { CalculatorDef, CalcResult } from '@/features/medical-calculator/types'

const calc = {
  id: 'meld-na',
  name: { en: 'MELD-Na Score', zh: 'MELD-Na 分數' },
  category: 'hepatic',
  inputs: [],
  compute: () => null,
} as unknown as CalculatorDef

describe('resultToClipboardText', () => {
  it('builds a one-line zh summary with interpretation + extras', () => {
    const result: CalcResult = {
      value: '14',
      interpretation: { en: 'Moderate risk', zh: '中度風險' },
      extra: [{ label: { en: '90-day mortality', zh: '90 天死亡率' }, value: '~6.0%' }],
    }
    expect(resultToClipboardText(calc, result, 'zh-TW')).toBe('MELD-Na 分數: 14 — 中度風險（90 天死亡率 ~6.0%）')
  })
  it('uses the English locale strings', () => {
    const result: CalcResult = { value: '14', interpretation: { en: 'Moderate risk', zh: '中度風險' } }
    expect(resultToClipboardText(calc, result, 'en')).toBe('MELD-Na Score: 14 — Moderate risk')
  })
  it('includes the unit and omits an absent interpretation/extras', () => {
    const result: CalcResult = { value: '32', unit: 'mL/min/1.73m²' }
    expect(resultToClipboardText(calc, result, 'en')).toBe('MELD-Na Score: 32 mL/min/1.73m²')
  })
})

describe('resultToFullClipboardText', () => {
  it('appends filled input rows with units and source, after the one-line result', () => {
    const result: CalcResult = { value: '52', unit: 'mL/min/1.73m²', interpretation: { en: 'G3a', zh: 'G3a' } }
    const text = resultToFullClipboardText(calc, result, 'zh-TW', [
      { label: '肌酸酐', value: '1.4', unit: 'mg/dL', source: '2026-06-02 · Creatinine' },
      { label: '年齡', value: '70', unit: 'y' },
      { label: '未填', value: '' },
    ])
    expect(text).toContain('MELD-Na 分數: 52 mL/min/1.73m² — G3a')
    expect(text).toContain('依據：')
    expect(text).toContain('• 肌酸酐: 1.4 mg/dL（2026-06-02 · Creatinine）')
    expect(text).toContain('• 年齡: 70 y')
    expect(text).not.toContain('未填') // empty-value rows are dropped
  })
  it('omits the inputs block entirely when nothing is filled', () => {
    const result: CalcResult = { value: '52' }
    expect(resultToFullClipboardText(calc, result, 'en', [{ label: 'x', value: '' }])).toBe('MELD-Na Score: 52')
  })
})

describe('isImplausible', () => {
  const plt = { normalRange: { low: 150, high: 400 } } // span 250, ×5 = 1250

  it('accepts values within / near the range', () => {
    expect(isImplausible(plt, '250')).toBe(false)
    expect(isImplausible(plt, '1000')).toBe(false)
  })
  it('flags a value far above the range (fat-finger)', () => {
    expect(isImplausible(plt, '5000')).toBe(true) // > 400 + 1250
  })
  it('never flags an empty field, a non-number, or a field without a range', () => {
    expect(isImplausible(plt, '')).toBe(false)
    expect(isImplausible(plt, 'abc')).toBe(false)
    expect(isImplausible({}, '99999')).toBe(false)
  })
  it('flags a clearly-negative value below the extended low bound', () => {
    const age = { normalRange: { low: 40, high: 41 } } // span 1, ×5 = 5 → low bound min(0, 35)=0
    expect(isImplausible(age, '-3')).toBe(true) // −3 < 0
  })
})

describe('coherenceSpan', () => {
  it('returns null when dates are within the window', () => {
    expect(coherenceSpan(['2020-01-01', '2020-01-01'], 1)).toBeNull()
    expect(coherenceSpan(['2020-01-01', '2020-01-02'], 1)).toBeNull() // 1 day == window
  })
  it('flags a span beyond the window with earliest/latest', () => {
    const r = coherenceSpan(['2020-01-10', '2020-01-01', '2020-01-05'], 1)
    expect(r).toEqual({ spanDays: 9, earliest: '2020-01-01', latest: '2020-01-10' })
  })
  it('ignores missing dates and needs ≥ 2 to compare', () => {
    expect(coherenceSpan([undefined, '2020-01-01'], 1)).toBeNull()
    expect(coherenceSpan([undefined, undefined], 1)).toBeNull()
  })
  it('truncates datetime precision to the day', () => {
    expect(coherenceSpan(['2020-01-01T23:00:00Z', '2020-01-01T01:00:00Z'], 0)).toBeNull() // same day
  })
})

describe('coherence config integrity', () => {
  it('every coherence.keys entry references a real input key', () => {
    const bad: string[] = []
    for (const c of CALCULATORS) {
      if (!c.coherence) continue
      const keys = new Set(c.inputs.map((i) => i.key))
      for (const k of c.coherence.keys) if (!keys.has(k)) bad.push(`${c.id}:${k}`)
    }
    expect(bad).toEqual([])
  })
  it('the paired urine/serum + ABG calculators declare a coherence window', () => {
    const withCoherence = new Set(CALCULATORS.filter((c) => c.coherence).map((c) => c.id))
    for (const id of ['fena', 'feurea', 'anion-gap', 'osmolar-gap', 'ttkg', 'urine-anion-gap', 'aa-gradient', 'pf-ratio']) {
      expect(withCoherence.has(id)).toBe(true)
    }
  })
})
