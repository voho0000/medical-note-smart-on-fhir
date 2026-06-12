// Interpretation Helper Functions (audit C3 — shared by clinical-summary
// reports and ips-export's inference engine)

interface CodeableConcept {
  coding?: Array<{ code?: string; display?: string }>
  text?: string
}

/**
 * Check if a numeric observation is outside its FHIR referenceRange.
 * Mirrors the Layer A / A.5 logic in useLabPivot so the regular report view
 * highlights abnormal values even when the bridge omits interpretation codes.
 *
 * Supports:
 *   - Structured referenceRange.low/high
 *   - Plain text "lo-hi" / "lo~hi" (e.g. "4.8-5.9")
 *   - VGH bracket text "[lo][hi]" / "[lo][]" / "[][hi]"
 */
export function checkReferenceRangeAbnormal(obs: any): boolean {
  const numVal = obs?.valueQuantity?.value
  if (numVal === undefined || numVal === null) return false
  const rr = obs?.referenceRange?.[0]
  if (!rr) return false

  let lo: number | undefined = rr.low?.value
  let hi: number | undefined = rr.high?.value

  // Parse text fallback when structured low/high are absent
  if (lo === undefined && hi === undefined && rr.text) {
    const t = (rr.text as string).trim()
    // VGH bracket: "[4.8][5.9]", "[lo][]", "[][hi]"
    const bracketM = t.match(/^\[([^\]]*)\]\[([^\]]*)\]$/)
    if (bracketM) {
      const [, loStr, hiStr] = bracketM
      if (loStr) { const n = parseFloat(loStr); if (!isNaN(n)) lo = n }
      if (hiStr) { const n = parseFloat(hiStr); if (!isNaN(n)) hi = n }
    } else {
      // Plain range: "4.8-5.9" / "4.8~5.9"
      const rangeM = t.match(/^([\d.]+)\s*[-~–]\s*([\d.]+)$/)
      if (rangeM) {
        lo = parseFloat(rangeM[1])
        hi = parseFloat(rangeM[2])
      } else {
        // Upper-only: "< 5.9" / "<= 5.9"
        const hiM = t.match(/^<[=]?\s*([\d.]+)$/)
        if (hiM) hi = parseFloat(hiM[1])
        // Lower-only: "> 4.8" / ">= 4.8"
        const loM = t.match(/^>[=]?\s*([\d.]+)$/)
        if (loM) lo = parseFloat(loM[1])
      }
    }
  }

  if (lo !== undefined && numVal < lo) return true
  if (hi !== undefined && numVal > hi) return true
  return false
}

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
