// features/clinical-summary/components/DiagnosesCard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }

type Condition = {
  resourceType: "Condition"
  id?: string
  code?: CodeableConcept
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  category?: CodeableConcept[]
  onsetDateTime?: string
  recordedDate?: string
  encounter?: { reference?: string }
}

type Row = {
  id: string
  title: string
  when?: string
  verification?: string
  clinical?: string
  categories?: string[]
}

function ccText(cc?: CodeableConcept) {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}
function fmtDate(d?: string) {
  if (!d) return ""
  try { return new Date(d).toLocaleDateString() } catch { return d }
}

export function DiagnosesCard() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr(null)
      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()
        const pid = await client.getPatientId()
        if (!pid) { if (alive) setErr("No patient id from session."); return }
        const pidQ = encodeURIComponent(pid)

        // 只拿「臨床狀態=active」優先；若空，再退回全部 Condition
        let flat = await client
          .request(`Condition?patient=${pidQ}&clinical-status=active&_count=100&_sort=-onset-date`, { flat: true })
          .catch(() => null)

        if (!flat || (Array.isArray(flat) && flat.length === 0)) {
          flat = await client
            .request(`Condition?patient=${pidQ}&_count=100&_sort=-onset-date`, { flat: true })
            .catch(() => null)
        }

        const list: Condition[] = Array.isArray(flat)
          ? (flat as any[]).filter(r => r.resourceType === "Condition")
          : []

        const activePrefer = list
          .filter(c => {
            const cs = (c.clinicalStatus?.coding?.[0]?.code || c.clinicalStatus?.text || "").toLowerCase()
            return !cs || cs === "active" || cs === "recurrence" || cs === "relapse"
          })

        const useList = activePrefer.length > 0 ? activePrefer : list

        const rowsTmp: Row[] = useList.map(c => ({
          id: c.id || Math.random().toString(36),
          title: ccText(c.code),
          when: fmtDate(c.onsetDateTime || c.recordedDate),
          clinical: ccText(c.clinicalStatus),
          verification: ccText(c.verificationStatus),
          categories: (c.category || []).map(ccText).filter(Boolean),
        }))

        if (alive) setRows(rowsTmp)
      } catch (e: any) {
        console.error(e)
        if (alive) setErr(e?.message || "Failed to load diagnoses")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading diagnoses…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>
    if (rows.length === 0) return <div className="text-sm text-muted-foreground">No active diagnoses.</div>

    return (
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="rounded-md border p-3">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{r.title}</div>
              {r.when && <div className="text-xs text-muted-foreground">{r.when}</div>}
            </div>

            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {r.clinical && (
                <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">
                  {r.clinical}
                </span>
              )}
              {r.verification && (
                <span className="inline-flex items-center rounded bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">
                  {r.verification}
                </span>
              )}
              {r.categories?.map((c, i) => (
                <span key={i} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                  {c}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    )
  }, [rows, loading, err])

  return (
    <Card>
      <CardHeader><CardTitle>Diagnosis / Problem List</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
