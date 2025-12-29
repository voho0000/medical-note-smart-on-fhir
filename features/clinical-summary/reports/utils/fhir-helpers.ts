// FHIR Helper Functions - Re-export from shared utils
export {
  getCodeableConceptText,
  getConceptText,
  formatQuantity,
  formatDateTime as formatDate,
} from '@/src/shared/utils/fhir-helpers'

import type { ReferenceRange, Quantity } from '@/src/shared/types/fhir.types'

export function getValueWithUnit(v?: Quantity, fallback?: string): string {
  if (v && v.value != null) {
    return `${v.value}${v.unit ? " " + v.unit : ""}`
  }
  return fallback ?? "—"
}

export function getReferenceRangeText(rr?: ReferenceRange[]): string {
  if (!rr || rr.length === 0) return ""
  const r = rr[0]
  if (r.text) return `Ref: ${r.text}`
  const low = r.low?.value
  const high = r.high?.value
  const unit = r.low?.unit || r.high?.unit
  if (low != null && high != null) return `Ref: ${low}–${high}${unit ? " " + unit : ""}`
  if (low != null) return `Ref: ≥${low}${unit ? " " + unit : ""}`
  if (high != null) return `Ref: ≤${high}${unit ? " " + unit : ""}`
  return ""
}
