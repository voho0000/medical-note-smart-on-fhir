// features/clinical-summary/components/MedListCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"
import { Badge } from "@/components/ui/badge"

type Coding = { 
  system?: string 
  code?: string 
  display?: string 
}

type CodeableConcept = { 
  text?: string 
  coding?: Coding[] 
}

type TimingRepeat = {
  frequency?: number
  period?: number
  periodUnit?: string // "d" | "h" | "wk" | "mo" | ...
}

type DoseAndRate = {
  doseQuantity?: { value?: number; unit?: string }
  doseRange?: { 
    low?: { value?: number; unit?: string } 
    high?: { value?: number; unit?: string } 
  }
}

type Medication = {
  id?: string
  resourceType?: string  // Made optional to handle cases where it might be missing
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  medicationReference?: { display?: string }
  authoredOn?: string
  effectiveDateTime?: string
  dosageInstruction?: Array<{
    text?: string
    route?: CodeableConcept
    timing?: { repeat?: TimingRepeat }
    doseAndRate?: DoseAndRate[]
  }>
  dosage?: Array<{
    text?: string
    route?: CodeableConcept
    timing?: { repeat?: TimingRepeat }
    doseAndRate?: DoseAndRate[]
  }>
  // Add other possible FHIR medication properties that might be present
  code?: CodeableConcept
  medication?: CodeableConcept
  resource?: {
    code?: CodeableConcept
  }
}

type Row = {
  id: string
  title: string
  status: string
  detail?: string
  when?: string
}

function ccText(cc?: CodeableConcept) {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}
function fmtDate(d?: string) {
  if (!d) return ""
  try { return new Date(d).toLocaleString() } catch { return d }
}

// --- helpers: 劑量與單位 -----------------------------------------

function round1(n: number) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n
}

function normalizeFormUnit(u?: string) {
  if (!u) return ""
  const s = u.toLowerCase().trim()
  if (["tablet", "tablets", "tab", "tabs", "錠"].includes(s)) return "tab"
  if (["capsule", "capsules", "cap", "caps"].includes(s)) return "cap"
  if (["milliliter", "milliliters", "ml", "mL"].includes(s)) return "mL"
  if (["drop", "drops", "gtt"].includes(s)) return "drop"
  if (["puff", "puffs", "actuation", "spray", "sprays"].includes(s)) return "puff"
  // 其他像 mg / g / mcg 等不是「劑型數量」，但也回傳原單位
  if (["mg","g","mcg","μg","ug"].includes(s)) return s
  return u // fallback 原字
}

/** 盡量回傳「每次劑量 + 單位」，e.g. "1 tab" | "10 mL" | "40 mg"
 *  來源優先序：doseQuantity -> doseRange -> dosage.text（簡易擷取）
 */
function humanDoseAmount(doseAndRate?: DoseAndRate[], text?: string) {
  const d = doseAndRate?.[0]
  // 1) doseQuantity
  if (d?.doseQuantity?.value != null) {
    const v = round1(d.doseQuantity.value!)
    const u = normalizeFormUnit(d.doseQuantity.unit || "")
    return `${v}${u ? " " + u : ""}`
  }
  // 2) doseRange（較少見）
  if (d?.doseRange?.low?.value != null || d?.doseRange?.high?.value != null) {
    const lo = d.doseRange.low
    const hi = d.doseRange.high
    const unit = normalizeFormUnit(lo?.unit || hi?.unit || "")
    const left = lo?.value != null ? String(round1(lo.value)) : ""
    const right = hi?.value != null ? String(round1(hi.value)) : ""
    const core = left && right ? `${left}-${right}` : (left || right)
    if (core) return `${core}${unit ? " " + unit : ""}`
  }
  // 3) 從 dosage.text 嘗試擷取（很粗略，但常夠用）
  if (text) {
    // e.g. "Take 1 tablet daily", "1 cap bid", "10 mL q6h"
    const m = text.match(/(\d+(?:\.\d+)?)\s*(tab(?:let)?s?|cap(?:sule)?s?|mL|ml|mg|mcg|g|drop(?:s)?|puff(?:s)?)/i)
    if (m) {
      const val = m[1]
      const unit = normalizeFormUnit(m[2])
      return `${val} ${unit}`
    }
  }
  return "" // 沒抓到就空字串，交由頻率/途徑補敘述
}

// --- helpers: 頻率轉臨床縮寫（不帶 1#） ------------------------

function humanDoseFreq(rep?: TimingRepeat) {
  if (!rep) return ""
  const freq = rep.frequency ?? 0
  const period = rep.period ?? 0
  const unitRaw = (rep.periodUnit || "").toLowerCase()

  const unit =
    unitRaw.startsWith("d") ? "day" :
    unitRaw.startsWith("h") ? "hour" :
    unitRaw.startsWith("wk") ? "week" :
    unitRaw.startsWith("mo") ? "month" :
    unitRaw

  if (unit === "day" && period === 1) {
    const map: Record<number, string> = { 1: "QD", 2: "BID", 3: "TID", 4: "QID" }
    const code = map[freq]
    if (code) return code
    if (freq > 0) return `${freq}×/day`
  }

  if (unit === "hour" && period > 0 && freq === 1) return `q${period}h`
  if (unit === "week" && period === 1 && freq === 1) return "QW"
  if (unit === "month" && period === 1 && freq === 1) return "QM"

  if (unit === "day" && period > 0 && freq > 0) return `${freq}× every ${period} day${period > 1 ? "s" : ""}`
  if (unit === "hour" && period > 0 && freq > 0) return `${freq}× q${period}h`
  if (unit === "week" && period > 0 && freq > 0) return `${freq}× every ${period} week${period > 1 ? "s" : ""}`
  if (unit === "month" && period > 0 && freq > 0) return `${freq}× every ${period} month${period > 1 ? "s" : ""}`

  return ""
}

// --- 組裝每筆顯示 ------------------------------------------------

function buildDetail({
  doseAndRate, doseText, route, repeat
}: {
  doseAndRate?: DoseAndRate[]
  doseText?: string
  route?: CodeableConcept
  repeat?: TimingRepeat
}) {
  const dose = humanDoseAmount(doseAndRate, doseText)   // e.g. 1 tab / 10 mL / 40 mg
  const r = ccText(route)                               // e.g. Oral / PO
  const freq = humanDoseFreq(repeat)                    // e.g. QD / BID / q12h

  const parts = [
    dose ? `Dose: ${dose}` : "",
    r !== "—" ? `Route: ${r}` : "",
    freq ? `Freq: ${freq}` : "",
  ].filter(Boolean)

  return parts.join(" · ")
}

// -----------------------------------------------------------------

export function MedListCard() {
  const { medications = [], isLoading, error } = useClinicalData()

  const rows = useMemo<Row[]>(() => {
    if (!Array.isArray(medications)) return []

    return medications.map((med: any) => {  // Using 'any' to be more permissive with the data structure
      // Handle different FHIR medication resource structures
      const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]
      
      // Get medication name from various possible locations in the FHIR resource
      let medicationName = 'Unknown Medication'
      if (med.medicationCodeableConcept) {
        medicationName = ccText(med.medicationCodeableConcept)
      } else if (med.medicationReference?.display) {
        medicationName = med.medicationReference.display
      } else if (med.code?.text) {
        medicationName = med.code.text
      } else if (med.medication?.text) {
        medicationName = med.medication.text
      } else if (med.resource?.code?.text) {
        medicationName = med.resource.code.text
      } else if (med.code?.coding?.[0]?.display) {
        medicationName = med.code.coding[0].display
      }
      
      const detail = buildDetail({
        doseAndRate: dosage?.doseAndRate,
        doseText: dosage?.text,
        route: dosage?.route,
        repeat: dosage?.timing?.repeat
      })

      return {
        id: med.id || Math.random().toString(36),
        title: medicationName,
        status: med.status?.toLowerCase() || "unknown",
        detail: detail || undefined,
        when: fmtDate(med.authoredOn || med.effectiveDateTime),
      }
    })
  }, [medications])

  const body = useMemo(() => {
    if (isLoading) return <div className="text-sm text-muted-foreground">Loading medications…</div>
    if (error) return <div className="text-sm text-red-600">{error instanceof Error ? error.message : String(error)}</div>
    if (rows.length === 0) return <div className="text-sm text-muted-foreground">No medications found.</div>

    return (
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{row.title}</div>
              <Badge 
                variant={
                  row.status === 'active' ? 'default' : 
                  row.status === 'completed' || row.status === 'stopped' ? 'secondary' : 'outline'
                }
                className="ml-2 capitalize"
              >
                {row.status}
              </Badge>
            </div>
            {row.detail && (
              <div className="mt-1 text-sm text-muted-foreground">
                {row.detail}
              </div>
            )}
            {row.when && (
              <div className="mt-1 text-xs text-muted-foreground">
                {row.when}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }, [rows, isLoading, error])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {body}
      </CardContent>
    </Card>
  )
}
