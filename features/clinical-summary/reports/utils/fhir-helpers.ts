// FHIR Helper Functions - Re-export from shared utils
export {
  getCodeableConceptText,
  getConceptText,
  formatQuantity,
  formatDate,
} from '@/src/shared/utils/fhir-helpers'

import type { ReferenceRange, Quantity } from '@/src/shared/types/fhir.types'
import { formatNumberSmart } from './number-format.utils'

export function getValueWithUnit(v?: Quantity, fallback?: string): string {
  if (v && v.value != null) {
    const cmp = v.comparator ? v.comparator : ''
    const formattedValue = formatNumberSmart(v.value)
    return `${cmp}${formattedValue}${v.unit ? " " + v.unit : ""}`
  }
  return fallback ?? "—"
}

export function getOriginalValueWithUnit(v?: Quantity, fallback?: string): string {
  if (v && v.value != null) {
    const cmp = v.comparator ? v.comparator : ''
    return `${cmp}${v.value}${v.unit ? " " + v.unit : ""}`
  }
  return fallback ?? "—"
}

// The bridge sometimes emits the WHOLE reference-range text twice, back-to-back
// ("[X][X]" where X is itself a bracketed value or a long age/sex-stratified
// band list). Collapse identical halves so it isn't shown doubled. Only fires
// on an exact half-split at a "][" boundary, so genuine ranges are untouched.
function collapseDoubledRangeText(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && t.length % 2 === 0) {
    const h = t.length / 2
    if (t[h - 1] === ']' && t[h] === '[' && t.slice(0, h) === t.slice(h)) return t.slice(0, h)
  }
  return t
}

function parseVghBracketText(text: string): string {
  const t = collapseDoubledRangeText(text)
  // VGH format: "[low][high]" → "low–high", "[val][]" → "val", "[][val]" → "≤val"
  const m = t.match(/^\[([^\]]*)\]\[([^\]]*)\]$/)
  if (m) {
    const [, lo, hi] = m
    if (!lo && !hi) return ""
    if (!lo) {
      const n = parseFloat(hi)
      return isNaN(n) ? hi : `≤${hi}`
    }
    if (!hi) return lo  // qualitative like "Negative" — no ≥ prefix
    const loN = parseFloat(lo), hiN = parseFloat(hi)
    if (!isNaN(loN) && isNaN(hiN)) return `≥${lo}`  // numeric low, text high (unusual)
    return `${lo}–${hi}`
  }
  // Complex / multi-band text we can't reduce (e.g. age/sex-stratified). Strip a
  // single outer bracket layer so the caller's re-wrap doesn't double it; the
  // full text is still shown (wrapped) in the hover tooltip.
  const outer = t.match(/^\[([\s\S]*)\]$/)
  return outer ? outer[1] : t
}

export function getReferenceRangeText(rr?: ReferenceRange[]): string {
  if (!rr || rr.length === 0) return ""
  const r = rr[0]
  // Prefer structured low/high (bridge now provides Quantity with units)
  const low = r.low?.value
  const high = r.high?.value
  if (low != null || high != null) {
    const unit = r.low?.unit || r.high?.unit
    if (low != null && high != null) return `[${low}–${high}${unit ? " " + unit : ""}]`
    if (low != null) return `[≥${low}${unit ? " " + unit : ""}]`
    if (high != null) return `[≤${high}${unit ? " " + unit : ""}]`
  }
  // Fallback: parse VGH bracket text format
  if (r.text) {
    const cleaned = parseVghBracketText(r.text)
    return cleaned ? `[${cleaned}]` : ""
  }
  return ""
}
