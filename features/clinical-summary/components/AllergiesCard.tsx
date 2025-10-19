// features/clinical-summary/components/AllergiesCard.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { usePatient } from "@/lib/providers/PatientProvider"

type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }

type AllergyIntolerance = {
  resourceType: "AllergyIntolerance"
  id?: string
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  criticality?: "low" | "high" | "unable-to-assess"
  code?: CodeableConcept
  reaction?: {
    manifestation?: CodeableConcept[]
    severity?: "mild" | "moderate" | "severe"
    description?: string
    onset?: string
  }[]
  recordedDate?: string
}

type AdverseEvent = {
  resourceType: "AdverseEvent"
  id?: string
  date?: string
  severity?: "mild" | "moderate" | "severe"
  seriousness?: CodeableConcept
  outcome?: CodeableConcept
  suspectEntity?: { instance?: { reference?: string; display?: string } }[]
  event?: CodeableConcept
}

function ccText(c?: CodeableConcept) {
  return c?.text || c?.coding?.[0]?.display || c?.coding?.[0]?.code || "—"
}
function fmtDate(d?: string) {
  if (!d) return ""
  try { return new Date(d).toLocaleString() } catch { return d }
}

export function AllergiesCard() {
  const { patient } = usePatient()
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>([])
  const [events, setEvents] = useState<AdverseEvent[]>([])
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

        // active 過敏
        const ai = await client.request(
          `AllergyIntolerance?patient=${pid}&clinical-status=active&_count=100&_sort=-recorded-date`,
          { flat: true }
        ).catch(() => []) as any[]

        // 不良事件
        const ae = await client.request(
          `AdverseEvent?subject=Patient/${pid}&_count=50&_sort=-date`,
          { flat: true }
        ).catch(() => []) as any[]

        if (!alive) return
        setAllergies((ai || []).filter(r => r.resourceType === "AllergyIntolerance"))
        setEvents((ae || []).filter(r => r.resourceType === "AdverseEvent"))
      } catch (e:any) {
        console.error(e)
        if (alive) setErr(e?.message || "Failed to load allergy/adverse events")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [patient?.id])

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading allergies & adverse events…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>

    return (
      // 兩欄並排；小螢幕改為一欄
      <div className="grid gap-4 md:grid-cols-2">
        {/* Allergies（左） */}
        <section>
          <div className="mb-2 text-sm font-medium">Allergies (active)</div>
          {allergies.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active allergies.</div>
          ) : (
            <ul className="space-y-2">
              {allergies.map(a => {
                const substance = ccText(a.code)
                const vStatus = ccText(a.verificationStatus)
                const crit = a.criticality
                const reactions = a.reaction || []
                return (
                  <li key={a.id || Math.random()} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{substance}</span>
                      {crit && (
                        <Badge variant={crit === "high" ? "destructive" : "secondary"}>
                          criticality: {crit}
                        </Badge>
                      )}
                      {vStatus !== "—" && (
                        <Badge variant="outline">verify: {vStatus}</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDate(a.recordedDate)}</span>
                    </div>
                    {reactions.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {reactions.map((r, i) => (
                          <li key={i} className="text-muted-foreground">
                            • {r.severity ? <span className="font-medium text-foreground">{r.severity.toUpperCase()}</span> : null}
                            {r.manifestation?.length
                              ? <> {r.severity ? " – " : ""}{r.manifestation.map(m => ccText(m)).join(", ")}</>
                              : null}
                            {r.description ? <> – {r.description}</> : null}
                            {r.onset ? <span className="ml-1">({fmtDate(r.onset)})</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Adverse Events（右） */}
        <section>
          <div className="mb-2 text-sm font-medium">Adverse Events</div>
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No adverse events.</div>
          ) : (
            <ul className="space-y-2">
              {events.map(e => {
                const name = ccText(e.event)
                const outcome = ccText(e.outcome)
                const serious = ccText(e.seriousness)
                const suspect = e.suspectEntity?.map(s => s.instance?.display).filter(Boolean).join(", ")
                return (
                  <li key={e.id || Math.random()} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{name}</span>
                      {e.severity && <Badge variant="outline">severity: {e.severity}</Badge>}
                      {serious !== "—" && <Badge variant="destructive">serious: {serious}</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {suspect ? <>Suspect: <span className="text-foreground">{suspect}</span> · </> : null}
                      Outcome: {outcome}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    )
  }, [allergies, events, loading, err])

  return (
    <Card>
      <CardHeader><CardTitle>Conditions / Allergies & Adverse Events</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
