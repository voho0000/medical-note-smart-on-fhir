// features/clinical-summary/components/MedListCard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePatient } from "@/lib/providers/PatientProvider"

type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }

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
    timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } }
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
    timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } }
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

export function MedListCard() {
  const { patient } = usePatient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!patient?.id) return
      setLoading(true)
      setErr(null)

      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()
        const pid = encodeURIComponent(patient.id)

        // 1) 只取 active 的 MedicationRequest
        const reqBundle = await client.request(
          `MedicationRequest?patient=${pid}&status=active&_count=100&_sort=-authoredon`,
          { flat: true }
        ).catch(() => []) as any[]

        let rowsTmp: Row[] = []

        const reqs = (reqBundle || []).filter(r => r.resourceType === "MedicationRequest") as MedicationRequest[]
        if (reqs.length > 0) {
          rowsTmp = reqs
            // 以防萬一再保險過濾一次 active
            .filter(r => (r.status || "").toLowerCase() === "active")
            .map(r => {
              const dose = r.dosageInstruction?.[0]
              const doseTxt = dose?.text
              const route = ccText(dose?.route)
              const timing = dose?.timing?.repeat
                ? `${dose.timing.repeat.frequency ?? ""} / ${dose.timing.repeat.period ?? ""}${dose.timing.repeat.periodUnit ?? ""}`.trim()
                : ""

              const detail = [doseTxt, route !== "—" ? `Route: ${route}` : "", timing !== " / " ? `Freq: ${timing}` : ""]
                .filter(Boolean)
                .join(" · ")

              return {
                id: r.id || Math.random().toString(36),
                title: ccText(r.medicationCodeableConcept),
                status: r.status || "active",
                detail: detail || undefined,
                when: fmtDate(r.authoredOn),
              }
            })
        } else {
          // 2) 沒有 MR 時，退回 MedicationStatement（同樣只拿 active）
          const stmBundle = await client.request(
            `MedicationStatement?patient=${pid}&status=active&_count=100&_sort=-_lastUpdated`,
            { flat: true }
          ).catch(() => []) as any[]

          const stms = (stmBundle || []).filter(r => r.resourceType === "MedicationStatement") as MedicationStatement[]
          rowsTmp = stms
            .filter(s => (s.status || "").toLowerCase() === "active")
            .map(s => {
              const dose = s.dosage?.[0]
              const doseTxt = dose?.text
              const route = ccText(dose?.route)
              const timing = dose?.timing?.repeat
                ? `${dose.timing.repeat.frequency ?? ""} / ${dose.timing.repeat.period ?? ""}${dose.timing.repeat.periodUnit ?? ""}`.trim()
                : ""

              const detail = [doseTxt, route !== "—" ? `Route: ${route}` : "", timing !== " / " ? `Freq: ${timing}` : ""]
                .filter(Boolean)
                .join(" · ")

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
            {/* status 幾乎都會是 active，保留顯示以利除錯 */}
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
