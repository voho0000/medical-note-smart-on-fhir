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

function parseVghBracketText(text: string): string {
  // VGH format: "[low][high]" → "low–high", "[val][]" → "val", "[][val]" → "≤val"
  const m = text.match(/^\[([^\]]*)\]\[([^\]]*)\]$/)
  if (!m) return text
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
