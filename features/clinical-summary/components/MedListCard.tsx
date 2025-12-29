// features/clinical-summary/components/MedListCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
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
  dose?: string
  route?: string
  frequency?: string
  detail?: string
  startedOn?: string
  stoppedOn?: string
  durationDays?: number
  isInactive: boolean
}

function ccText(cc?: CodeableConcept) {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}
function fmtDate(d?: string) {
  if (!d) return ""
  try {
    return new Date(d).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
  } catch {
    return d
  }
}

function extractFrequencyFromText(text?: string) {
  if (!text) return ""
  const upper = text.toUpperCase()
  const known = upper.match(/\b(QD|BID|TID|QID|QOD|QHS|HS|PRN)\b/)
  if (known) return known[1]
  const every = upper.match(/Q(\d+)H/)
  if (every) return `q${every[1]}h`
  const everyHours = text.match(/every\s+(\d+)\s*hour/i)
  if (everyHours) return `q${everyHours[1]}h`
  const perDay = text.match(/(\d+)\s*(?:times|x)\s*(?:per|\/)?\s*day/i)
  if (perDay) return `${perDay[1]}×/day`
  return ""
}

type DurationLike = {
  value?: number
  unit?: string
  code?: string
}

type PeriodLike = {
  start?: string
  end?: string
}

const UNIT_TO_DAYS: Record<string, number> = {
  d: 1,
  day: 1,
  days: 1,
  "24h": 1,
  wk: 7,
  w: 7,
  week: 7,
  weeks: 7,
  mo: 30,
  month: 30,
  months: 30,
  a: 365,
  y: 365,
  year: 365,
  years: 365,
  h: 1 / 24,
  hr: 1 / 24,
  hour: 1 / 24,
  hours: 1 / 24,
  min: 1 / (24 * 60),
  minute: 1 / (24 * 60),
  minutes: 1 / (24 * 60),
  s: 1 / (24 * 60 * 60),
  sec: 1 / (24 * 60 * 60),
  second: 1 / (24 * 60 * 60),
  seconds: 1 / (24 * 60 * 60),
}

function convertDurationToDays(duration?: DurationLike) {
  if (!duration?.value) return undefined
  const rawUnit = (duration.unit || duration.code || "").toLowerCase()
  if (!rawUnit) return undefined
  const factor = UNIT_TO_DAYS[rawUnit]
  if (!factor) return undefined
  const days = duration.value * factor
  if (!Number.isFinite(days) || days <= 0) return undefined
  return Math.round(days)
}

function periodToDays(period?: PeriodLike) {
  if (!period?.start || !period?.end) return undefined
  const startDate = new Date(period.start)
  const endDate = new Date(period.end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined
  const diff = endDate.getTime() - startDate.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  if (!Number.isFinite(days) || days <= 0) return undefined
  return days
}

function computeDurationDays({
  start,
  stop,
  expectedDuration,
  boundsDuration,
  boundsPeriod,
  validityPeriod,
}: {
  start?: string
  stop?: string
  expectedDuration?: DurationLike
  boundsDuration?: DurationLike
  boundsPeriod?: PeriodLike
  validityPeriod?: PeriodLike
}) {
  return (
    convertDurationToDays(expectedDuration) ??
    convertDurationToDays(boundsDuration) ??
    periodToDays(boundsPeriod) ??
    periodToDays(validityPeriod) ??
    periodToDays(start && stop ? { start, end: stop } : undefined)
  )
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

    const inactiveStatuses = new Set(["stopped", "completed"])

    const enriched = medications.map((med: any) => {
      const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]

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

      const status = med.status?.toLowerCase() || "unknown"
      const isInactive = inactiveStatuses.has(status)

      const doseSummary = humanDoseAmount(dosage?.doseAndRate, dosage?.text)
      const routeSummary = ccText(dosage?.route)
      const frequencySummary = humanDoseFreq(dosage?.timing?.repeat) || extractFrequencyFromText(dosage?.text) || ""

      const detail = buildDetail({
        doseAndRate: dosage?.doseAndRate,
        doseText: dosage?.text,
        route: dosage?.route,
        repeat: dosage?.timing?.repeat
      })

      const startDateRaw = med.authoredOn || med.effectiveDateTime || med.dispenseRequest?.validityPeriod?.start
      const stopDateRaw = isInactive
        ? med.dispenseRequest?.validityPeriod?.end || med.effectiveDateTime || med.authoredOn
        : undefined

      return {
        id: med.id || Math.random().toString(36),
        title: medicationName,
        status,
        detail: detail || undefined,
        dose: doseSummary || undefined,
        route: routeSummary && routeSummary !== "—" ? routeSummary : undefined,
        frequency: frequencySummary || undefined,
        startedOn: fmtDate(startDateRaw),
        stoppedOn: stopDateRaw ? fmtDate(stopDateRaw) : undefined,
        durationDays: computeDurationDays({
          start: startDateRaw,
          stop: stopDateRaw,
          expectedDuration: med.dispenseRequest?.expectedSupplyDuration,
          boundsDuration: dosage?.timing?.repeat?.boundsDuration,
          boundsPeriod: dosage?.timing?.repeat?.boundsPeriod,
          validityPeriod: med.dispenseRequest?.validityPeriod,
        }),
        isInactive,
        _startSortValue: startDateRaw ? new Date(startDateRaw).getTime() : 0
      }
    })

    return enriched
      .sort((a, b) => {
        if (a.isInactive !== b.isInactive) {
          return a.isInactive ? 1 : -1
        }
        return (b._startSortValue ?? 0) - (a._startSortValue ?? 0)
      })
      .map(({ _startSortValue, ...row }) => row)
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
            {(row.dose || row.frequency || row.route || row.detail) && (
              <div className="mt-1 grid gap-1 text-sm text-muted-foreground">
                {row.dose && <div>Dose: {row.dose}</div>}
                {row.frequency && <div>Frequency: {row.frequency}</div>}
                {row.route && <div>Route: {row.route}</div>}
                {row.detail && <div>Notes: {row.detail}</div>}
              </div>
            )}
            {(row.startedOn || row.stoppedOn || row.durationDays) && (
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {row.startedOn && <div>Start date: {row.startedOn}</div>}
                {row.stoppedOn && <div>Stop date: {row.stoppedOn}</div>}
                {row.durationDays && <div>Prescription length: {row.durationDays} days</div>}
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
