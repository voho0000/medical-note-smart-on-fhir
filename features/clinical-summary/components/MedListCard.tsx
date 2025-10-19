// features/clinical-summary/components/MedListCard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePatient } from "@/lib/providers/PatientProvider"

type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }

type TimingRepeat = {
  frequency?: number
  period?: number
  periodUnit?: string // "d" | "h" | "wk" | "mo" | ...
}

type DoseAndRate = {
  doseQuantity?: { value?: number; unit?: string }
  doseRange?: { low?: { value?: number; unit?: string }, high?: { value?: number; unit?: string } }
}

type MedicationRequest = {
  resourceType: "MedicationRequest"
  id?: string
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  authoredOn?: string
  dosageInstruction?: {
    text?: string
    route?: CodeableConcept
    timing?: { repeat?: TimingRepeat }
    doseAndRate?: DoseAndRate[]
  }[]
}

type MedicationStatement = {
  resourceType: "MedicationStatement"
  id?: string
  status?: string
  effectiveDateTime?: string
  medicationCodeableConcept?: CodeableConcept
  dosage?: {
    text?: string
    route?: CodeableConcept
    timing?: { repeat?: TimingRepeat }
    doseAndRate?: DoseAndRate[]
  }[]
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
  const { patient } = usePatient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!patient?.id) return
      setLoading(true); setErr(null)
      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()
        const pid = encodeURIComponent(patient.id)

        // 1) 先抓 active MedicationRequest
        const reqFlat = await client.request(
          `MedicationRequest?patient=${pid}&status=active&_count=100&_sort=-authoredon`,
          { flat: true }
        ).catch(() => []) as any[]

        let rowsTmp: Row[] = []
        const reqs = (reqFlat || []).filter(r => r.resourceType === "MedicationRequest") as MedicationRequest[]

        if (reqs.length > 0) {
          rowsTmp = reqs
            .filter(r => (r.status || "").toLowerCase() === "active")
            .map(r => {
              const d = r.dosageInstruction?.[0]
              const detail = buildDetail({
                doseAndRate: d?.doseAndRate,
                doseText: d?.text,
                route: d?.route,
                repeat: d?.timing?.repeat
              })
              return {
                id: r.id || Math.random().toString(36),
                title: ccText(r.medicationCodeableConcept),
                status: r.status || "active",
                detail: detail || undefined,
                when: fmtDate(r.authoredOn),
              }
            })
        } else {
          // 2) 沒有 MR 時用 MedicationStatement（同樣只拿 active）
          const stmFlat = await client.request(
            `MedicationStatement?patient=${pid}&status=active&_count=100&_sort=-_lastUpdated`,
            { flat: true }
          ).catch(() => []) as any[]

          const stms = (stmFlat || []).filter(r => r.resourceType === "MedicationStatement") as MedicationStatement[]
          rowsTmp = stms
            .filter(s => (s.status || "").toLowerCase() === "active")
            .map(s => {
              const d = s.dosage?.[0]
              const detail = buildDetail({
                doseAndRate: d?.doseAndRate,
                doseText: d?.text,
                route: d?.route,
                repeat: d?.timing?.repeat
              })
              return {
                id: s.id || Math.random().toString(36),
                title: ccText(s.medicationCodeableConcept),
                status: s.status || "active",
                detail: detail || undefined,
                when: fmtDate(s.effectiveDateTime),
              }
            })
        }

        if (alive) setRows(rowsTmp)
      } catch (e: any) {
        console.error(e)
        if (alive) setErr(e?.message || "Failed to load medications")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [patient?.id])

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading medications…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>
    if (rows.length === 0) return <div className="text-sm text-muted-foreground">No active medications.</div>

    return (
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="rounded-md border p-3">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{r.when}</div>
            </div>
            {r.detail && <div className="text-sm text-muted-foreground mt-1">{r.detail}</div>}
            <div className="mt-1 text-xs">
              <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">
                {r.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    )
  }, [rows, loading, err])

  return (
    <Card>
      <CardHeader><CardTitle>Medications (Active)</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
