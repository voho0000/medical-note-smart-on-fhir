// Pure presentation helpers for the calculator detail view — extracted from the
// component so they can be unit-tested without rendering.

import type { CalculatorDef, CalcResult, NumberInput } from './types'
import { tr } from './types'

/** One-line, paste-ready summary of a result for a clinical note / chat —
 *  e.g. "MELD-Na 分數: 14 — 中度風險（90 天死亡率 ~6.0%）". The whole point of a
 *  calculator inside a note-writing app is getting the answer INTO the note. */
export function resultToClipboardText(calc: CalculatorDef, result: CalcResult, locale: string): string {
  const value = result.value + (result.unit ? ` ${result.unit}` : "")
  let text = `${tr(locale, calc.name)}: ${value}`
  if (result.interpretation) text += ` — ${tr(locale, result.interpretation)}`
  const extras = (result.extra ?? []).map((r) => `${tr(locale, r.label)} ${r.value}`)
  if (extras.length) text += `（${extras.join("; ")}）`
  return text
}

/**
 * A generic, per-field outlier check: flags a manually-entered value that's far
 * outside the field's reference range (>5× the range's width beyond either
 * edge). This is NOT a hard clinical limit — some legitimately extreme values do
 * occur — just a "did you fat-finger this?" nudge for fields that have no other
 * validation (native `type="number"` doesn't stop someone typing "-5" for
 * platelets or "9999" for age). Fields without a `normalRange` skip the check
 * entirely rather than guessing a bound.
 */
export function isImplausible(input: Pick<NumberInput, 'normalRange'>, raw: string): boolean {
  if (!input.normalRange || raw === '') return false
  const v = parseFloat(raw)
  if (!Number.isFinite(v)) return false
  const { low, high } = input.normalRange
  const span = Math.max(high - low, 1e-6)
  return v < Math.min(0, low - span * 5) || v > high + span * 5
}
