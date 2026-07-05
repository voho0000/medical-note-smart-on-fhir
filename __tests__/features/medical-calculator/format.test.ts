import { resultToClipboardText, isImplausible } from '@/features/medical-calculator/format'
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
