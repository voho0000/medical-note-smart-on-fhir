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
    const formattedValue = formatNumberSmart(v.value)
    return `${formattedValue}${v.unit ? " " + v.unit : ""}`
  }
  return fallback ?? "—"
}

export function getOriginalValueWithUnit(v?: Quantity, fallback?: string): string {
  if (v && v.value != null) {
    return `${v.value}${v.unit ? " " + v.unit : ""}`
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
  if (r.text) {
    const cleaned = parseVghBracketText(r.text)
    return cleaned ? `[${cleaned}]` : ""
  }
  const low = r.low?.value
  const high = r.high?.value
  const unit = r.low?.unit || r.high?.unit
  if (low != null && high != null) return `[${low}–${high}${unit ? " " + unit : ""}]`
  if (low != null) return `[≥${low}${unit ? " " + unit : ""}]`
  if (high != null) return `[≤${high}${unit ? " " + unit : ""}]`
  return ""
}
