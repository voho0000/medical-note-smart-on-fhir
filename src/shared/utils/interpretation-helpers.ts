// Interpretation Helper Functions (audit C3 — shared by clinical-summary
// reports and ips-export's inference engine)
//
// POLICY (2026-07-08, per user directive): the SOURCE's Observation.interpretation
// is the single authority for "is this result abnormal". The app must NOT run
// its own range math to override or supplement an explicit interpretation.
// 健康存摺 and most EHRs already ship N / H / L / …, and many hospitals send
// unreliable referenceRange TEXT (duplicated "[lo ~ hi][lo ~ hi]" brackets,
// sex / age / specimen-conditional prose). App-side re-judging produced false
// red flags on perfectly normal reports. Rules:
//   1. interpretation present  → it decides; no range math runs.
//   2. interpretation absent    → STRUCTURED referenceRange.low/high only.
//   3. referenceRange.text       → never parsed (too many unsafe formats).

interface CodeableConcept {
  coding?: Array<{ code?: string; display?: string }>
  text?: string
}

// FHIR `Observation.interpretation` has cardinality 0..* — it is an ARRAY of
// CodeableConcept. The bridge / FhirMapper pass it through verbatim, so at
// runtime callers hand us the raw array; some entity code paths hand us a single
// CodeableConcept. Normalise to the first concept either way. (Reading the array
// as if it were a single concept — `arr.coding` — silently yields undefined,
// which is exactly the bug that made every interpretation code get ignored.)
function firstConcept(
  interp: CodeableConcept | CodeableConcept[] | undefined,
): CodeableConcept | undefined {
  if (!interp) return undefined
  return Array.isArray(interp) ? interp[0] : interp
}

/**
 * Check whether a numeric observation is outside its STRUCTURED FHIR
 * referenceRange (referenceRange.low / referenceRange.high). Deliberately does
 * NOT parse referenceRange.text — that free-text field carries too many
 * unreliable formats (duplicated "[lo ~ hi][lo ~ hi]" brackets, sex/age/
 * specimen-conditional prose) to judge safely. Used ONLY as a last-resort
 * fallback when the source provides no interpretation at all.
 */
export function checkReferenceRangeAbnormal(obs: any): boolean {
  const numVal = obs?.valueQuantity?.value
  if (numVal === undefined || numVal === null) return false
  const rr = obs?.referenceRange?.[0]
  if (!rr) return false

  const lo: number | undefined = rr.low?.value
  const hi: number | undefined = rr.high?.value

  if (lo !== undefined && numVal < lo) return true
  if (hi !== undefined && numVal > hi) return true
  return false
}

export interface InterpretationTag {
  label: string
  style: string
}

function getInterpretationCode(concept?: CodeableConcept | CodeableConcept[]): string {
  const c = firstConcept(concept)
  const raw = c?.coding?.[0]?.code || c?.coding?.[0]?.display || c?.text || ""
  return (raw || "").toString().toUpperCase()
}

export function getInterpretationTag(concept?: CodeableConcept | CodeableConcept[]): InterpretationTag | null {
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
  } else if (["A", "AA", "ABN", "ABNORMAL"].includes(code)) {
    label = "Abnormal"
    style = "bg-amber-100 text-amber-700 border border-amber-200"
  } else if (["POS", "POSITIVE", "DETECTED", "REACTIVE"].includes(code)) {
    label = "Positive"
    style = "bg-orange-100 text-orange-700 border border-orange-200"
  } else if (["NEG", "NEGATIVE", "NOT DETECTED", "NONREACTIVE", "NR"].includes(code)) {
    label = "Negative"
    style = "bg-emerald-100 text-emerald-700 border border-emerald-200"
  } else if (["N", "NORMAL"].includes(code)) {
    label = "Normal"
    style = "bg-gray-100 text-gray-600 border border-gray-200"
  }

  return { label, style }
}

// Tag labels that count as "abnormal" for value colouring / abnormal counts.
// 'Normal' and 'Negative' (the desired serology outcome) are NOT abnormal. An
// UNRECOGNISED interpretation code (muted tag, raw label) is treated as NOT
// abnormal too, so an unknown code never produces a false red flag — the app
// only ever flags codes it positively recognises as abnormal.
const ABNORMAL_TAG_LABELS = new Set([
  "High", "Critical High", "Low", "Critical Low", "Abnormal", "Positive",
])

// Label-string form for callers that already carry a computed tag label
// (e.g. visit-history rows store `interpretationLabel: tag.label`).
export function isAbnormalInterpretationLabel(label?: string | null): boolean {
  return !!label && ABNORMAL_TAG_LABELS.has(label)
}

export function isInterpretationAbnormal(tag: InterpretationTag | null): boolean {
  return isAbnormalInterpretationLabel(tag?.label)
}

/**
 * Single source of truth for "should this observation be flagged abnormal".
 *   1. Source interpretation is authoritative when present (N/Normal/Negative →
 *      not abnormal; H/L/A/Positive/… → abnormal). No app-side range math runs.
 *   2. Only when there is NO interpretation at all → structured
 *      referenceRange.low/high (never referenceRange.text).
 * Accepts a raw FHIR observation (interpretation array or single concept).
 */
export function isObservationAbnormal(obs: any): boolean {
  const tag = getInterpretationTag(obs?.interpretation)
  if (tag) return isInterpretationAbnormal(tag)
  return checkReferenceRangeAbnormal(obs)
}
