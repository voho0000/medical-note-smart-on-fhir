// Medical Calculator — unit conversion
//
// Auto-fill values arrive in whatever unit the source lab reported. Each
// calculator input declares a `dimension` (the analyte's measurement family)
// and its expected/base unit is the conventional (US / Taiwan) unit the
// formula assumes. This module converts a source value into that base unit.
//
// Factors are expressed relative to the BASE (expected) unit = 1. Conversion
// is `value × factor[sourceUnit]`. A factor of 1 (e.g. mEq/L ↔ mmol/L for a
// monovalent electrolyte, or 10³/µL ↔ 10⁹/L for platelets) means the units are
// interchangeable — no numeric change, no warning.

import type { ConvertDim } from './types'

/** Normalize a unit string for lookup: lowercase, strip spaces, µ/μ → u, and
 *  collapse the many ways an exponent is written (10⁹, 10*9, 10e9, x10^9) to a
 *  single `10^9` form. */
export function normUnit(u: string | undefined): string {
  return (u || '')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/\s+/g, '')
    .replace(/·/g, '')
    // Superscript exponent → `^<digit>` (10⁹ → 10^9), so the caret is preserved.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '^' + '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)])
    .replace(/10\*/g, '10^') // 10*9/l → 10^9/l
    .replace(/10e/g, '10^') // 10e9/l → 10^9/l
    .replace(/x10\^/g, '10^') // x10^9/l → 10^9/l
    .replace(/\^\^/g, '^') // guard against a doubled caret
    .replace(/^x/, '')
    .trim()
}

/** Source-unit → factor to the dimension's base (expected) unit. */
const FACTORS: Record<ConvertDim, Record<string, number>> = {
  // Monovalent electrolytes: mmol/L ≡ mEq/L (Na, K, Cl, HCO₃/CO₂).
  electrolyte: { 'mmol/l': 1, 'meq/l': 1 },
  // Creatinine: base mg/dL. 1 mg/dL = 88.42 µmol/L.
  creatinine: { 'mg/dl': 1, 'umol/l': 1 / 88.42, 'mmol/l': 1000 / 88.42 },
  // Bilirubin: base mg/dL. 1 mg/dL = 17.104 µmol/L.
  bilirubin: { 'mg/dl': 1, 'umol/l': 1 / 17.104 },
  // Calcium: base mg/dL. 1 mmol/L = 4.008 mg/dL; 1 mEq/L = 2.004 mg/dL.
  calcium: { 'mg/dl': 1, 'mmol/l': 4.008, 'meq/l': 2.004 },
  // Glucose: base mg/dL. 1 mmol/L = 18.016 mg/dL.
  glucose: { 'mg/dl': 1, 'mmol/l': 18.016 },
  // Albumin: base g/dL. 1 g/dL = 10 g/L.
  albumin: { 'g/dl': 1, 'g/l': 0.1 },
  // Aminotransferases: U/L ≡ IU/L.
  enzyme: { 'u/l': 1, 'iu/l': 1 },
  // BUN: base mg/dL. 1 mmol/L urea = 2.8 mg/dL BUN (nitrogen).
  bun: { 'mg/dl': 1, 'mmol/l': 2.8 },
  // Cholesterol (TC/HDL/LDL): base mg/dL. 1 mmol/L = 38.67 mg/dL.
  cholesterol: { 'mg/dl': 1, 'mmol/l': 38.67 },
  // Triglyceride: base mg/dL. 1 mmol/L = 88.57 mg/dL.
  triglyceride: { 'mg/dl': 1, 'mmol/l': 88.57 },
  // Ethanol: base mg/dL. 1 mmol/L = 4.61 mg/dL.
  ethanol: { 'mg/dl': 1, 'mmol/l': 4.61 },
  // Platelets: base 10⁹/L ≡ 10³/µL ≡ 1000/µL ≡ K/µL. Raw /µL is ×1000.
  platelets: { '10^9/l': 1, '10^3/ul': 1, '1000/ul': 1, 'k/ul': 1, '/ul': 0.001, '10^6/ul': 1000 },
  // WBC: same cell-count units as platelets (10⁹/L ≡ 10³/µL ≡ K/µL).
  wbc: { '10^9/l': 1, '10^3/ul': 1, '1000/ul': 1, 'k/ul': 1, '/ul': 0.001 },
  // Weight: base kg.
  weight: { kg: 1, g: 0.001, lb: 0.453592, lbs: 0.453592 },
  // Height: base cm.
  height: { cm: 1, m: 100, in: 2.54, inch: 2.54, '"': 2.54 },
}

export interface UnitConversion {
  /** Value in the expected/base unit. */
  value: number
  /** True when the numeric value actually changed (source unit ≠ base unit). */
  changed: boolean
}

/**
 * Convert `value` from `fromUnit` into the base unit of `dimension`.
 * Returns null when the calculator input has no dimension, or the source unit
 * is unrecognized for that dimension (→ caller keeps the raw value and warns).
 */
export function convertToBase(
  value: number,
  fromUnit: string | undefined,
  dimension: ConvertDim | undefined,
): UnitConversion | null {
  if (!dimension) return null
  const table = FACTORS[dimension]
  if (!table) return null
  const factor = table[normUnit(fromUnit)]
  if (factor === undefined) return null
  const converted = value * factor
  return { value: converted, changed: Math.abs(converted - value) > 1e-9 }
}
