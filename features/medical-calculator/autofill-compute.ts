// Shared "seed from autofill → compute" logic. This is the SINGLE source of
// truth for turning one calculator input + the patient's data into a seeded
// value (with unit conversion). Both the detail view (CalculatorDetail.seed)
// and the list (computeAutofilledResult, for the inline card result) resolve
// inputs through `resolveInput` here, so the two can never drift.

import type { CalcInput, CalcResult, CalculatorDef, AutofillSource } from './types'
import type { Autofill } from './hooks/use-lab-autofill.hook'
import { convertToBase, normUnit } from './units'

export function formatNum(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

/** Everything a caller might need about one seeded input. The list uses only
 *  `value` + `date`; the detail view additionally uses the unit/conversion
 *  fields to render its auto-fill badges. */
export interface ResolvedInput {
  /** Seeded string value for the field (already unit-converted). */
  value: string
  /** effectiveDateTime of the source observation, '' when not from patient data. */
  date: string
  /** True when this came from patient data (not a default / left empty). */
  filled: boolean
  /** Unit the source observation reported the value in. */
  sourceUnit: string
  /** Unit to DISPLAY: the expected unit when a numeric conversion happened,
   *  otherwise the source unit (so equivalent-unit fills show the chart's unit). */
  displayUnit: string
  /** True when the value was numerically converted into the expected unit. */
  changed: boolean
  /** The original (pre-conversion) source value, for the "from X" hint. */
  origValue: number
  /** True when the source unit differs and could NOT be converted → real ⚠. */
  unconvertible: boolean
}

const EMPTY: ResolvedInput = {
  value: '', date: '', filled: false, sourceUnit: '', displayUnit: '', changed: false, origValue: 0, unconvertible: false,
}

/** Resolve one input against the patient's data. Single source of truth for
 *  both seeding logics. */
export function resolveInput(input: CalcInput, autofill: Autofill): ResolvedInput {
  if (input.type === 'select') {
    if (input.source?.kind === 'sex' && autofill.sex) return { ...EMPTY, value: autofill.sex }
    return { ...EMPTY, value: input.defaultValue ?? input.options[0]?.value ?? '' }
  }
  const expected = input.unit ?? ''
  const hit = autofill.resolve(input.source)
  if (!hit) return { ...EMPTY, value: input.defaultValue ?? '', displayUnit: expected }

  // Safety gate: a value matched only by display name (viaLoinc === false) whose
  // unit is incompatible with the input's expected dimension is probably a
  // different analyte — don't autofill it. LOINC-matched values (trusted
  // identity) are never rejected here; a genuine unit mismatch there still
  // surfaces as the ⚠ badge below.
  if (hit.viaLoinc === false && input.dimension && hit.unit) {
    const compatible = convertToBase(hit.value, hit.unit, input.dimension) != null
    const sameUnit = normUnit(hit.unit) === normUnit(expected)
    if (!compatible && !sameUnit) {
      return { ...EMPTY, value: input.defaultValue ?? '', displayUnit: expected }
    }
  }

  const conv = convertToBase(hit.value, hit.unit, input.dimension)
  if (conv && conv.changed) {
    // Genuine numeric conversion — the box now holds an expected-unit value.
    return { value: formatNum(conv.value), date: hit.date, filled: true, sourceUnit: hit.unit, displayUnit: expected, changed: true, origValue: hit.value, unconvertible: false }
  }
  if (conv) {
    // Equivalent unit (factor 1) — keep the source value AND show the source
    // unit, since that's what the chart actually reported.
    return { value: formatNum(hit.value), date: hit.date, filled: true, sourceUnit: hit.unit, displayUnit: hit.unit || expected, changed: false, origValue: hit.value, unconvertible: false }
  }
  // No conversion rule — keep the raw value and show its real unit; flag it
  // only when the units genuinely differ (never cry wolf on a unitless input
  // or a unit that matches the expected one).
  const sameUnit = normUnit(hit.unit) === normUnit(expected)
  return {
    value: formatNum(hit.value), date: hit.date, filled: true, sourceUnit: hit.unit, displayUnit: hit.unit || expected,
    changed: false, origValue: hit.value, unconvertible: !sameUnit && !!hit.unit && !!input.unit,
  }
}

/** Resolve a single input to its seeded string value only. */
export function resolveValue(input: CalcInput, autofill: Autofill): string {
  return resolveInput(input, autofill).value
}

const DATA_SOURCE_KINDS: AutofillSource['kind'][] = ['lab', 'labSpecimen', 'labLoinc', 'vital', 'age', 'sex']

/**
 * True only when EVERY required input is backed by patient data (a lab/vital/
 * demographic source) — i.e. no clinical-judgment select or manual-entry number.
 * These are the calculators whose result can be trusted inline on the card
 * without the clinician confirming anything. A clinical yes/no select (dialysis,
 * comorbidity) or a manual number (SBP, PT) makes a calculator NOT eligible, so
 * we never show an under-/over-estimate built from default values.
 */
export function isFullyAutofillable(calc: CalculatorDef): boolean {
  return calc.inputs.every((inp) => {
    if (inp.type === 'number' && inp.optional) return true
    return !!inp.source && DATA_SOURCE_KINDS.includes(inp.source.kind)
  })
}

export interface AutofilledResult {
  result: CalcResult
  /** ISO date of the OLDEST data-backed input the result depends on — the
   *  staleness signal for a glanceable inline card (e.g. an eGFR built off a
   *  year-old creatinine shouldn't look as fresh as one from today). Null
   *  when every input is dateless (age/sex only — effectively always current). */
  asOf: string | null
}

/** Compute a calculator's result purely from autofilled data, or null when it
 *  isn't fully data-driven, the required data is missing, or `compute` throws
 *  (a defensive guard — one bad formula must not break the whole list). */
export function computeAutofilledResult(calc: CalculatorDef, autofill: Autofill): AutofilledResult | null {
  if (!isFullyAutofillable(calc)) return null
  try {
    const values: Record<string, string> = {}
    let asOf: string | null = null
    for (const inp of calc.inputs) {
      const resolved = resolveInput(inp, autofill)
      values[inp.key] = resolved.value
      if (resolved.date && (asOf === null || resolved.date < asOf)) asOf = resolved.date
    }
    const result = calc.compute(values)
    return result ? { result, asOf } : null
  } catch (err) {
    console.error(`[medical-calculator] compute() threw for "${calc.id}":`, err)
    return null
  }
}
