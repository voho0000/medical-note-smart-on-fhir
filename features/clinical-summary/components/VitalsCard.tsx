"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePatient } from "@/lib/providers/PatientProvider"

type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }
type Quantity = { value?: number; unit?: string }
type ObsComponent = { code?: CodeableConcept; valueQuantity?: Quantity; valueString?: string }

type Observation = {
  resourceType: "Observation"
  id?: string
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  component?: ObsComponent[]
  effectiveDateTime?: string
  status?: string
}

const LOINC = {
  HEIGHT: "8302-2",
  WEIGHT: "29463-7",   // 備選: 3141-9
  BMI: "39156-5",
  BP_PANEL: "85354-9",
  BP_SYS: "8480-6",
  BP_DIA: "8462-4",
  HR: "8867-4",
  RR: "9279-1",
  TEMP: "8310-5",
  SPO2: "59408-5",     // 常見 SpO₂；有些系統也會用 2708-6（氧分壓，非 SpO2）
}

function ccText(c?: CodeableConcept) {
  return c?.text || c?.coding?.[0]?.display || c?.coding?.[0]?.code || "—"
}
function qty(q?: { value?: number; unit?: string }) {
    if (!q || q.value == null) return "—"
    const v = Number(q.value)
    const formatted = v.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: v % 1 === 0 ? 0 : 1,
    })
    return `${formatted}${q.unit ? ` ${q.unit}` : ""}`
  }
  
function fmtDate(d?: string) {
  if (!d) return ""
  try { return new Date(d).toLocaleString() } catch { return d }
}

// 從一堆 Observation 中，挑出指定 LOINC 的「最新一筆」
function pickLatestByCode(list: Observation[], code: string): Observation | undefined {
  const filtered = list.filter(o => (o.code?.coding || []).some(c => c.code === code))
  filtered.sort((a,b) => (new Date(b.effectiveDateTime || 0).getTime() - new Date(a.effectiveDateTime || 0).getTime()))
  return filtered[0]
}

export function VitalsCard() {
  const { patient } = usePatient()
  const [obs, setObs] = useState<Observation[]>([])
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

        // 一次取多個 LOINC（含 BP panel）
        const codes = [
          LOINC.HEIGHT, LOINC.WEIGHT, LOINC.BMI,
          LOINC.BP_PANEL, LOINC.BP_SYS, LOINC.BP_DIA,
          LOINC.HR, LOINC.RR, LOINC.TEMP, LOINC.SPO2,
        ].join(",")

        const bundle = await client.request(
          `Observation?patient=${pid}&code=${codes}&_count=200&_sort=-date`,
          { flat: true }
        ).catch(() => []) as any[]

        const list = (bundle || []).filter(r => r.resourceType === "Observation") as Observation[]

        if (!alive) return
        setObs(list)
      } catch (e:any) {
        console.error(e)
        if (alive) setErr(e?.message || "Failed to load vitals")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [patient?.id])

  // 計算各 vital
  const view = useMemo(() => {
    const height = pickLatestByCode(obs, LOINC.HEIGHT)
    const weight = pickLatestByCode(obs, LOINC.WEIGHT)
    const bmi    = pickLatestByCode(obs, LOINC.BMI)

    // 血壓優先從 panel 解 component，若沒有 panel，退回單項
    let bpS: string | null = null
    let bpD: string | null = null
    const bpPanel = pickLatestByCode(obs, LOINC.BP_PANEL)
    if (bpPanel?.component?.length) {
      const s = bpPanel.component.find(c => (c.code?.coding||[]).some(x => x.code === LOINC.BP_SYS))
      const d = bpPanel.component.find(c => (c.code?.coding||[]).some(x => x.code === LOINC.BP_DIA))
      if (s?.valueQuantity?.value != null) bpS = String(Math.round(Number(s.valueQuantity.value)))
      if (d?.valueQuantity?.value != null) bpD = String(Math.round(Number(d.valueQuantity.value)))
    } else {
      const sObs = pickLatestByCode(obs, LOINC.BP_SYS)
      const dObs = pickLatestByCode(obs, LOINC.BP_DIA)
      if (sObs?.valueQuantity?.value != null) bpS = String(Math.round(Number(sObs.valueQuantity.value)))
      if (dObs?.valueQuantity?.value != null) bpD = String(Math.round(Number(dObs.valueQuantity.value)))
    }

    const hr   = pickLatestByCode(obs, LOINC.HR)
    const rr   = pickLatestByCode(obs, LOINC.RR)
    const temp = pickLatestByCode(obs, LOINC.TEMP)
    const spo2 = pickLatestByCode(obs, LOINC.SPO2)

    const lastTime =
      [height, weight, bmi, bpPanel, hr, rr, temp, spo2]
        .map(o => o?.effectiveDateTime ? new Date(o.effectiveDateTime).getTime() : 0)
        .reduce((a,b) => Math.max(a,b), 0)

    return {
      height: height?.valueQuantity ? qty(height.valueQuantity) : "—",
      weight: weight?.valueQuantity ? qty(weight.valueQuantity) : "—",
      bmi:    bmi?.valueQuantity    ? qty(bmi.valueQuantity)    : "—",
      bp:     (bpS && bpD) ? `${bpS}/${bpD} mmHg` : "—",
      hr:     hr?.valueQuantity   ? `${Math.round(Number(hr.valueQuantity.value))} bpm` : "—",
      rr:     rr?.valueQuantity   ? `${Math.round(Number(rr.valueQuantity.value))} /min` : "—",
      temp:   temp?.valueQuantity ? qty(temp.valueQuantity) : "—",
      spo2:   spo2?.valueQuantity ? `${Math.round(Number(spo2.valueQuantity.value))}%` : "—",
      time:   lastTime ? fmtDate(new Date(lastTime).toISOString()) : "",
    }
  }, [obs])

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading vitals…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KV k="Height" v={view.height} />
          <KV k="Weight" v={view.weight} />
          <KV k="BMI"    v={view.bmi} />
          <KV k="BP"     v={view.bp} />
          <KV k="HR"     v={view.hr} />
          <KV k="RR"     v={view.rr} />
          <KV k="Temp"   v={view.temp} />
          <KV k="SpO₂"   v={view.spo2} />
        </div>
        {view.time && <div className="text-xs text-muted-foreground">Last updated: {view.time}</div>}
      </div>
    )
  }, [view, loading, err])

  return (
    <Card>
      <CardHeader><CardTitle>Vitals</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="text-base font-medium">{v}</div>
    </div>
  )
}
