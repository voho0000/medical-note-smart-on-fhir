// FHIR Helper Functions for Allergies
import type { CodeableConcept } from '../types'

export function getCodeableConceptText(cc?: CodeableConcept | any): string {
  if (!cc) return "—"
  return cc.text || cc.coding?.[0]?.display || cc.coding?.[0]?.code || "—"
}

export function formatDate(d?: string): string {
  if (!d) return ""
  try { 
    return new Date(d).toLocaleDateString() 
  } catch { 
    return d 
  }
}
