// FHIR Helper Functions
import type { CodeableConcept, Quantity, ReferenceRange } from '../types'

export function getCodeableConceptText(cc?: CodeableConcept): string {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}

export function getConceptText(input?: CodeableConcept | CodeableConcept[]): string {
  if (!input) return "—"
  if (Array.isArray(input)) {
    return input.map(getCodeableConceptText).filter(Boolean).join(", ") || "—"
  }
  return getCodeableConceptText(input)
}

export function formatQuantity(q?: Quantity): string {
  if (!q || q.value == null) return "—"
  return `${q.value}${q.unit ? " " + q.unit : ""}`
}

export function getValueWithUnit(v?: Quantity, fallback?: string): string {
  if (v && v.value != null) return formatQuantity(v)
  return fallback ?? "—"
}

export function formatDate(d?: string): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
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
