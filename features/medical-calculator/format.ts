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

/** One input row for the detailed clipboard export. */
export interface ClipboardInputRow {
  label: string
  value: string
  unit?: string
  /** e.g. "2026-06-02 · Creatinine" — date + source test name. */
  source?: string
}

/**
 * A fuller note export: the one-line result PLUS the inputs it was computed
 * from, each with its value/unit and (when auto-filled) its source date/report.
 * For an auditable note ("eGFR 52 … based on Creatinine 1.4 mg/dL from 2026-06-02").
 */
export function resultToFullClipboardText(
  calc: CalculatorDef,
  result: CalcResult,
  locale: string,
  rows: ClipboardInputRow[],
): string {
  const lines = [resultToClipboardText(calc, result, locale)]
  const filled = rows.filter((r) => r.value !== '')
  if (filled.length) {
    lines.push(locale === 'zh-TW' ? '依據：' : 'Inputs:')
    for (const r of filled) {
      const unit = r.unit ? ` ${r.unit}` : ''
      const src = r.source ? `（${r.source}）` : ''
      lines.push(`  • ${r.label}: ${r.value}${unit}${src}`)
    }
  }
  return lines.join('\n')
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

/**
 * Temporal-coherence check for multi-lab formulas. Given the source dates (ISO,
 * any precision) of the auto-filled inputs that should share a draw/day, returns
 * the span (in whole days) and the earliest/latest date when it exceeds
 * `windowDays` — otherwise null. Fewer than two dated inputs → null (nothing to
 * compare). Used to warn that e.g. FENa may be mixing values from different
 * reports rather than one paired urine+serum set.
 */
export function coherenceSpan(dates: (string | undefined)[], windowDays: number): { spanDays: number; earliest: string; latest: string } | null {
  const days = dates.filter((d): d is string => !!d).map((d) => d.slice(0, 10))
  if (days.length < 2) return null
  const sorted = [...new Set(days)].sort()
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]
  const spanDays = Math.round((new Date(latest).getTime() - new Date(earliest).getTime()) / 86_400_000)
  return spanDays > windowDays ? { spanDays, earliest, latest } : null
}
