import { getInterpretationTag } from "@/src/shared/utils/interpretation-helpers"

type Quantity = { value?: number; unit?: string }
type ReferenceRange = { low?: Quantity; high?: Quantity; text?: string }
type CodeableConcept = { text?: string; coding?: Array<{ display?: string; code?: string; system?: string }> }

export const qty = (q?: Quantity) => {
  if (!q || q.value == null) return "—"
  return `${q.value}${q.unit ? ` ${q.unit}` : ""}`
}

export const valueWithUnit = (value?: Quantity, fallback?: string) => {
  if (value && value.value != null) return qty(value)
  return fallback ?? "—"
}

// See fhir-helpers.ts collapseDoubledRangeText — the bridge sometimes emits the
// whole reference-range text twice ("[X][X]"); collapse identical halves.
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
    if (!lo) return `≤${hi}`
    if (!hi) return lo  // qualitative like "Negative"
    const loN = parseFloat(lo), hiN = parseFloat(hi)
    if (!isNaN(loN) && !isNaN(hiN)) return `${lo}–${hi}`
    return lo
  }
  // Complex / multi-band text: strip a single outer bracket layer so the caller's
  // re-wrap doesn't double it (full text stays in the hover tooltip).
  const outer = t.match(/^\[([\s\S]*)\]$/)
  return outer ? outer[1] : t
}

export const refRangeText = (ranges?: ReferenceRange[]) => {
  if (!ranges?.length) return ""
  const range = ranges[0]
  const low = range.low?.value
  const high = range.high?.value
  const unit = range.low?.unit || range.high?.unit
  if (low != null && high != null) return `[${low}–${high}${unit ? ` ${unit}` : ""}]`
  if (low != null) return `[≥${low}${unit ? ` ${unit}` : ""}]`
  if (high != null) return `[≤${high}${unit ? ` ${unit}` : ""}]`
  if (range.text) {
    const cleaned = parseVghBracketText(range.text)
    return cleaned ? `[${cleaned}]` : ""
  }
  return ""
}

// Delegates to the single shared implementation so all three surfaces (reports,
// cumulative pivot, visit-history) share one tag-classification source. Critically,
// the shared version reads the FHIR `interpretation` ARRAY shape — this local copy
// used to read only `concept.coding` and silently returned null for the bridge's
// array-shaped interpretation, so visit-history chips never appeared for imported
// data. Accepts the array or a single concept.
export const getInterpTag = (concept?: CodeableConcept | CodeableConcept[]) =>
  getInterpretationTag(concept as any)

export const getReferenceId = (ref: any): string | null => {
  if (!ref) return null
  if (typeof ref === "string") {
    return ref.split("/").pop() || null
  }
  if (typeof ref === "object" && typeof ref.reference === "string") {
    return ref.reference.split("/").pop() || null
  }
  return null
}

export const getCodeText = (code?: { text?: string; coding?: Array<{ display?: string; code?: string }> }) => {
  return code?.text || code?.coding?.[0]?.display || code?.coding?.[0]?.code || ""
}

export const getMedicationName = (med: any) => {
  return (
    getCodeText(med?.medicationCodeableConcept) ||
    med?.medicationReference?.display ||
    getCodeText(med?.code) ||
    getCodeText(med?.medication) ||
    getCodeText(med?.resource?.code) ||
    "Unnamed medication"
  )
}

/**
 * Locale + audience-aware variant of getMedicationName.
 *   locale === 'en'           → always English (coding[].display)
 *   locale zh + medical       → English coding (pharmacology habit)
 *   locale zh + patient       → 中文 text (friendlier for laypeople)
 * Falls back through medicationReference / code / medication / resource.code
 * just like the legacy helper.
 */
export const getMedicationNameLocalized = (
  med: any,
  audience: 'medical' | 'patient',
  locale: string = 'zh-TW',
) => {
  const pick = (concept: any): string => {
    if (!concept) return ''
    const text = typeof concept.text === 'string' ? concept.text.trim() : ''
    const coded = concept.coding?.[0]?.display
    const codedStr = typeof coded === 'string' ? coded.trim() : ''
    // English UI: force English regardless of audience.
    if (locale === 'en') return codedStr || text || ''
    return audience === 'patient'
      ? text || codedStr || ''
      : codedStr || text || ''
  }
  return (
    pick(med?.medicationCodeableConcept) ||
    med?.medicationReference?.display ||
    pick(med?.code) ||
    pick(med?.medication) ||
    pick(med?.resource?.code) ||
    'Unnamed medication'
  )
}

export const formatDateTime = (dateString?: string, locale: string = "en-US") => {
  if (!dateString) return undefined
  try {
    return new Date(dateString).toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
  }
}
