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

export const refRangeText = (ranges?: ReferenceRange[]) => {
  if (!ranges?.length) return ""
  const range = ranges[0]
  if (range.text) return `Ref: ${range.text}`
  const low = range.low?.value
  const high = range.high?.value
  const unit = range.low?.unit || range.high?.unit
  if (low != null && high != null) return `Ref: ${low}–${high}${unit ? ` ${unit}` : ""}`
  if (low != null) return `Ref: ≥${low}${unit ? ` ${unit}` : ""}`
  if (high != null) return `Ref: ≤${high}${unit ? ` ${unit}` : ""}`
  return ""
}

export const getInterpTag = (concept?: CodeableConcept) => {
  const raw = concept?.coding?.[0]?.code || concept?.coding?.[0]?.display || concept?.text || ""
  const code = raw?.toString().toUpperCase()
  if (!code) return null
  if (["H", "HI", "HIGH", "ABOVE", ">", "HH", "CRIT-HI"].includes(code)) {
    return { label: code === "HH" ? "Critical High" : "High", style: "bg-red-100 text-red-700 border border-red-200" }
  }
  if (["L", "LO", "LOW", "BELOW", "<", "LL", "CRIT-LO"].includes(code)) {
    return { label: code === "LL" ? "Critical Low" : "Low", style: "bg-blue-100 text-blue-700 border border-blue-200" }
  }
  if (["A", "ABN", "ABNORMAL"].includes(code)) {
    return { label: "Abnormal", style: "bg-amber-100 text-amber-700 border border-amber-200" }
  }
  if (["POS", "POSITIVE", "DETECTED", "REACTIVE"].includes(code)) {
    return { label: "Positive", style: "bg-orange-100 text-orange-700 border border-orange-200" }
  }
  if (["NEG", "NEGATIVE", "NOT DETECTED", "NONREACTIVE"].includes(code)) {
    return { label: "Negative", style: "bg-emerald-100 text-emerald-700 border border-emerald-200" }
  }
  if (["N", "NORMAL"].includes(code)) {
    return { label: "Normal", style: "bg-gray-100 text-gray-600 border border-gray-200" }
  }
  return { label: code, style: "bg-muted text-muted-foreground" }
}

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

export const formatDateTime = (dateString?: string) => {
  if (!dateString) return undefined
  try {
    return new Date(dateString).toLocaleString("en-US", {
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
