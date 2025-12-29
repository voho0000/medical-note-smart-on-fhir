// FHIR Helper Functions for Vitals
import type { CodeableConcept } from '../types'

export function getCodeableConceptText(c?: CodeableConcept): string {
  return c?.text || c?.coding?.[0]?.display || c?.coding?.[0]?.code || "—"
}

export function formatQuantity(q?: { value?: number; unit?: string }): string {
  if (!q || q.value == null) return "—"
  const v = Number(q.value)
  const formatted = v.toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: v % 1 === 0 ? 0 : 1,
  })
  return `${formatted}${q.unit ? ` ${q.unit}` : ""}`
}

export function formatDate(d?: string): string {
  if (!d) return ""
  try { 
    return new Date(d).toLocaleString() 
  } catch { 
    return d 
  }
}
