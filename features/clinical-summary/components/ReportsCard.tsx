// features/clinical-summary/components/ReportsCard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { usePatient } from "@/lib/providers/PatientProvider"

type Coding = { system?: string; code?: string; display?: string }
type Quantity = { value?: number; unit?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }
type ReferenceRange = {
  low?: Quantity
  high?: Quantity
  text?: string
}

type ObsComponent = {
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  interpretation?: CodeableConcept
  referenceRange?: ReferenceRange[]
}

type Observation = {
  resourceType: "Observation"
  id?: string
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  interpretation?: CodeableConcept
  referenceRange?: ReferenceRange[]
  component?: ObsComponent[]
  hasMember?: { reference?: string }[]
  effectiveDateTime?: string
  status?: string
  category?: CodeableConcept[]
  encounter?: { reference?: string }
}

type DiagnosticReport = {
  resourceType: "DiagnosticReport"
  id?: string
  category?: CodeableConcept[]
  code?: CodeableConcept
  status?: string
  issued?: string
  effectiveDateTime?: string
  result?: { reference?: string }[]
}

type Row = { id: string; title: string; meta: string; obs: Observation[] }

function ccText(cc?: CodeableConcept) {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}
function qty(q?: Quantity) {
  if (!q || q.value == null) return "—"
  return `${q.value}${q.unit ? " " + q.unit : ""}`
}
function valueWithUnit(v?: Quantity, fallback?: string) {
  if (v && v.value != null) return qty(v)
  return fallback ?? "—"
}
function fmtDate(d?: string) {
  if (!d) return "—"
  try { return new Date(d).toLocaleString() } catch { return d }
}
function refRangeText(rr?: ReferenceRange[]) {
  if (!rr || rr.length === 0) return ""
  const r = rr[0]
  // 1) 直接用 text
  if (r.text) return `Ref: ${r.text}`
  // 2) low–high 組字串
  const low = r.low?.value
  const high = r.high?.value
  const unit = r.low?.unit || r.high?.unit
  if (low != null && high != null) return `Ref: ${low}–${high}${unit ? " " + unit : ""}`
  if (low != null) return `Ref: ≥${low}${unit ? " " + unit : ""}`
  if (high != null) return `Ref: ≤${high}${unit ? " " + unit : ""}`
  return ""
}
function interpCode(concept?: CodeableConcept) {
  const raw = concept?.coding?.[0]?.code || concept?.coding?.[0]?.display || concept?.text || ""
  return (raw || "").toString().toUpperCase()
}
/** 將 interpretation 轉成 badge 樣式 & 顯示字 */
function getInterpTag(concept?: CodeableConcept) {
  const code = interpCode(concept)
  // 常見值：H/HH（高/顯著高）、L/LL（低/顯著低）、A（異常）、POS/NEG
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

export function ReportsCard() {
  const { patient } = usePatient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [debug, setDebug] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr(null); setDebug(null)
      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()
        const pid = await client.getPatientId()
        if (!pid) { if (alive) setErr("No patient id from session."); return }
        const pidQ = encodeURIComponent(pid)

        async function fetchDR(category?: "laboratory" | "LAB") {
          const base = `DiagnosticReport?patient=${pidQ}&_count=50&_sort=-date&_include=DiagnosticReport:result`
          const url = category ? `${base}&category=${category}` : base
          const bundle = await client.request(url, { flat: true }).catch(() => null)
          if (!bundle || !Array.isArray(bundle)) return [] as Row[]

          const reports: DiagnosticReport[] = []
          const obsIndex = new Map<string, Observation>()
          for (const r of bundle as any[]) {
            if (r.resourceType === "DiagnosticReport") reports.push(r as DiagnosticReport)
            if (r.resourceType === "Observation" && r.id) obsIndex.set(r.id, r as Observation)
          }

          async function expandHasMembers(o: Observation): Promise<Observation[]> {
            if (!o?.hasMember?.length) return [o]
            const list: Observation[] = []
            for (const m of o.hasMember) {
              const id = m.reference?.split("/")[1]
              if (!id) continue
              if (obsIndex.has(id)) list.push(obsIndex.get(id)!)
              else {
                try {
                  const child = await client.request(`Observation/${id}`)
                  if (child?.resourceType === "Observation") {
                    list.push(child as Observation)
                    if (child.id) obsIndex.set(child.id, child as Observation)
                  }
                } catch {}
              }
            }
            return [o, ...list]
          }

          const rowsDR: Row[] = []
          for (const dr of reports) {
            const collected: Observation[] = []
            for (const r of dr.result || []) {
              const id = r.reference?.split("/")[1]
              if (!id) continue
              const cached = obsIndex.get(id)
              if (cached) {
                const expanded = await expandHasMembers(cached)
                collected.push(...expanded)
              } else {
                try {
                  const fetched = await client.request(`Observation/${id}`)
                  if (fetched?.resourceType === "Observation") {
                    const expanded = await expandHasMembers(fetched as Observation)
                    collected.push(...expanded)
                  }
                } catch {}
              }
            }
            rowsDR.push({
              id: dr.id || Math.random().toString(36),
              title: ccText(dr.code),
              meta: `Laboratory • ${dr.status || "—"} • ${fmtDate(dr.issued || dr.effectiveDateTime)}`,
              obs: collected,
            })
          }
          return rowsDR
        }

        let allRows: Row[] = []
        const tried: string[] = []

        for (const cat of [undefined, "laboratory", "LAB"] as const) {
          tried.push(cat ? `DR(category=${cat})` : "DR(no category)")
          const r = await fetchDR(cat as any)
          if (r.length > 0) { allRows = r; break }
        }

        if (allRows.length === 0) {
          tried.push("OBS(category=laboratory)")
          let obsFlat = await client
            .request(`Observation?patient=${pidQ}&category=laboratory&_count=100&_sort=-date`, { flat: true })
            .catch(() => null)

          if (!obsFlat || (Array.isArray(obsFlat) && obsFlat.length === 0)) {
            tried.push("OBS(all)")
            obsFlat = await client
              .request(`Observation?patient=${pidQ}&_count=200&_sort=-date`, { flat: true })
              .catch(() => null)
          }

          const obsList: Observation[] = Array.isArray(obsFlat)
            ? (obsFlat as any[]).filter(r => r.resourceType === "Observation")
            : []

          const panels = obsList.filter(o =>
            (Array.isArray(o.component) && o.component.length > 0) ||
            (Array.isArray(o.hasMember) && o.hasMember.length > 0) ||
            !!o.valueQuantity || !!o.valueString
          )

          const groupKey = (o: Observation) =>
            (o.encounter?.reference || "") + "|" +
            (o.effectiveDateTime ? new Date(o.effectiveDateTime).toISOString().slice(0, 10) : "unknown") + "|" +
            (ccText(o.code) || "obs")

          const groups = new Map<string, Observation[]>()
          for (const o of panels) {
            const k = groupKey(o)
            const arr = groups.get(k) || []
            arr.push(o)
            groups.set(k, arr)
          }

          allRows = Array.from(groups.entries()).map(([k, lst]) => {
            const first = lst[0]
            return {
              id: k,
              title: ccText(first.code),
              meta: `Observation Group • ${fmtDate(first.effectiveDateTime)}`,
              obs: lst,
            }
          })
        }

        if (alive) {
          setRows(allRows)
          if (allRows.length === 0) setDebug(`Tried: ${tried.join(" → ")} (rows=0)`)
        }
      } catch (e: any) {
        console.error(e)
        if (alive) setErr(e?.message || "Failed to load reports")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  function ObservationBlock({ o }: { o: Observation }) {
    const title = ccText(o.code)
    const interp = getInterpTag(o.interpretation)
    const ref = refRangeText(o.referenceRange)

    const selfVal = (o.valueQuantity || o.valueString)
      ? (
        <div className="text-sm leading-relaxed">
          <span className="font-medium">{title}:</span>{" "}
          <span className={interp ? "font-semibold" : ""}>
            {o.valueQuantity ? valueWithUnit(o.valueQuantity) : (o.valueString ?? "—")}
          </span>
          {interp && (
            <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs ${interp.style}`}>
              {interp.label}
            </span>
          )}
          {ref && <span className="ml-2 text-xs text-muted-foreground">{ref}</span>}
        </div>
      )
      : (
        <div className="text-sm font-medium">{title}</div>
      )

    return (
      <div className="rounded-md border p-3">
        {selfVal}

        {/* 面板組件值 */}
        {Array.isArray(o.component) && o.component.length > 0 && (
          <div className="mt-2 grid gap-1 pl-2">
            {o.component.map((c, i) => {
              const name = ccText(c.code)
              const v = c.valueQuantity ? valueWithUnit(c.valueQuantity) : (c.valueString ?? "—")
              const ci = getInterpTag(c.interpretation)
              const rr = refRangeText(c.referenceRange)
              return (
                <div key={i} className="text-sm leading-relaxed">
                  • <span className="font-medium">{name}:</span>{" "}
                  <span className={ci ? "font-semibold" : ""}>{v}</span>
                  {ci && (
                    <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs ${ci.style}`}>
                      {ci.label}
                    </span>
                  )}
                  {rr && <span className="ml-2 text-xs text-muted-foreground">{rr}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading reports…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>
    if (rows.length === 0) {
      return (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">No lab reports.</div>
          {debug && <pre className="rounded bg-muted p-2 text-xs text-muted-foreground overflow-auto">{debug}</pre>}
        </div>
      )
    }

    const defaultOpen = rows.slice(0, 2).map(r => r.id)

    return (
      <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
        {rows.map(({ id, title, meta, obs }) => (
          <AccordionItem key={id} value={id} className="border rounded-md px-2">
            <AccordionTrigger className="py-3">
              <div className="flex flex-col items-start text-left">
                <div className="font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">{meta}</div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div className="space-y-2">
                {obs.length > 0
                  ? obs.map(o => <ObservationBlock key={o.id || Math.random().toString(36)} o={o} />)
                  : <div className="text-sm text-muted-foreground">No observations.</div>}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    )
  }, [rows, loading, err, debug])

  return (
    <Card>
      <CardHeader><CardTitle>Reports</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
