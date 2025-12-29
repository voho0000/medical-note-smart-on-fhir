// Interpretation Helper Functions
import type { CodeableConcept } from '../types'

export interface InterpretationTag {
  label: string
  style: string
}

function getInterpretationCode(concept?: CodeableConcept): string {
  const raw = concept?.coding?.[0]?.code || concept?.coding?.[0]?.display || concept?.text || ""
  return (raw || "").toString().toUpperCase()
}

export function getInterpretationTag(concept?: CodeableConcept): InterpretationTag | null {
  const code = getInterpretationCode(concept)
  if (!code) return null

  let label = code
  let style = "bg-muted text-muted-foreground"

  if (["H", "HI", "HIGH", "ABOVE", ">", "HH", "CRIT-HI"].includes(code)) {
    label = code === "HH" ? "Critical High" : "High"
    style = "bg-red-100 text-red-700 border border-red-200"
  } else if (["L", "LO", "LOW", "BELOW", "<", "LL", "CRIT-LO"].includes(code)) {
    label = code === "LL" ? "Critical Low" : "Low"
    style = "bg-blue-100 text-blue-700 border border-blue-200"
  } else if (["A", "ABN", "ABNORMAL"].includes(code)) {
    label = "Abnormal"
    style = "bg-amber-100 text-amber-700 border border-amber-200"
  } else if (["POS", "POSITIVE", "DETECTED", "REACTIVE"].includes(code)) {
    label = "Positive"
    style = "bg-orange-100 text-orange-700 border border-orange-200"
  } else if (["NEG", "NEGATIVE", "NOT DETECTED", "NONREACTIVE"].includes(code)) {
    label = "Negative"
    style = "bg-emerald-100 text-emerald-700 border border-emerald-200"
  } else if (["N", "NORMAL"].includes(code)) {
    label = "Normal"
    style = "bg-gray-100 text-gray-600 border border-gray-200"
  }

  return { label, style }
}
