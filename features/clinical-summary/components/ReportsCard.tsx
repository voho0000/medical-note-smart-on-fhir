// features/clinical-summary/components/ReportsCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"

type Coding = { system?: string; code?: string; display?: string }
type Quantity = { value?: number; unit?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }
type ReferenceRange = { low?: Quantity; high?: Quantity; text?: string }

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

interface DiagnosticReport {
  id?: string;
  resourceType: "DiagnosticReport";
  code?: CodeableConcept;
  status?: string;
  issued?: string;
  effectiveDateTime?: string;
  result?: { reference?: string }[];
  category?: CodeableConcept | CodeableConcept[];
  // provider 會塞進來的展開欄位
  _observations?: Observation[];
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
  if (r.text) return `Ref: ${r.text}`
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
function getInterpTag(concept?: CodeableConcept) {
  const code = interpCode(concept)
  if (!code) return null
  let label = code
  let style = "bg-muted text-muted-foreground"
  if (["H","HI","HIGH","ABOVE",">","HH","CRIT-HI"].includes(code)) { label = code==="HH"?"Critical High":"High"; style="bg-red-100 text-red-700 border border-red-200" }
  else if (["L","LO","LOW","BELOW","<","LL","CRIT-LO"].includes(code)) { label = code==="LL"?"Critical Low":"Low"; style="bg-blue-100 text-blue-700 border border-blue-200" }
  else if (["A","ABN","ABNORMAL"].includes(code)) { label="Abnormal"; style="bg-amber-100 text-amber-700 border border-amber-200" }
  else if (["POS","POSITIVE","DETECTED","REACTIVE"].includes(code)) { label="Positive"; style="bg-orange-100 text-orange-700 border border-orange-200" }
  else if (["NEG","NEGATIVE","NOT DETECTED","NONREACTIVE"].includes(code)) { label="Negative"; style="bg-emerald-100 text-emerald-700 border border-emerald-200" }
  else if (["N","NORMAL"].includes(code)) { label="Normal"; style="bg-gray-100 text-gray-600 border border-gray-200" }
  return { label, style }
}

export function ReportsCard() {
  const { diagnosticReports = [], observations = [], isLoading, error } = useClinicalData()

  // 將 DR 轉成 rows，並記錄已出現之 Observation IDs
  const { reportRows, seenIds } = useMemo(() => {
    const rows: Row[] = [];
    const seen = new Set<string>();
    
    (diagnosticReports as DiagnosticReport[]).forEach((dr) => {
      if (!dr || dr.resourceType !== "DiagnosticReport") return;
      
      const obs = Array.isArray(dr._observations) 
        ? dr._observations.filter((o): o is Observation => !!o?.resourceType && o.resourceType === 'Observation')
        : [];
      
      obs.forEach(o => { 
        if (o?.id) seen.add(o.id);
      });
      
      if (obs.length === 0) return;
      
      const category = Array.isArray(dr.category) 
        ? dr.category.map(c => ccText(c)).filter(Boolean).join(', ')
        : ccText(dr.category);
      
      rows.push({
        id: dr.id || Math.random().toString(36),
        title: ccText(dr.code) || "Unnamed Report",
        meta: `${category || "Laboratory"} • ${dr.status || "—"} • ${fmtDate(dr.issued || dr.effectiveDateTime)}`,
        obs
      });
    });
    
    return { reportRows: rows, seenIds: seen };
  }, [diagnosticReports]);

  // 找出沒有掛在 DR 的「孤兒」Observation（常見：生化），做分組
  const orphanRows: Row[] = useMemo(() => {
    if (!Array.isArray(observations)) return [];
    
    // 1) 篩掉已在 DR 內者
    const orphan = observations.filter((o): o is Observation => 
      o?.resourceType === 'Observation' && (!o.id || !seenIds.has(o.id))
    );

    // 2) 只保留有意義的 panel/數值
    const panels = orphan.filter((o) =>
      (Array.isArray(o.component) && o.component.length > 0) ||
      (Array.isArray(o.hasMember) && o.hasMember.length > 0) ||
      !!o.valueQuantity || !!o.valueString
    )

    // 3) 依 encounter + 日期 + 主碼分組（把同次抽血的生化項目聚在一起）
    const groupKey = (o: Observation) =>
      (o.encounter?.reference || "") + "|" +
      (o.effectiveDateTime ? new Date(o.effectiveDateTime).toISOString().slice(0,10) : "unknown") + "|" +
      (ccText(o.code) || "Observation")

    const groups = new Map<string, Observation[]>()
    for (const o of panels) {
      const k = groupKey(o)
      const arr = groups.get(k) || []
      arr.push(o)
      groups.set(k, arr)
    }

    return Array.from(groups.entries()).map(([k, lst]) => {
      const first = lst[0]
      return {
        id: `orphan:${k}`,
        title: ccText(first.code),
        meta: `Observation Group • ${fmtDate(first.effectiveDateTime)}`,
        obs: lst,
      }
    })
  }, [observations, seenIds])

  // 合併並按時間排序（新→舊）
  const rows: Row[] = useMemo(() => {
    const all = [...reportRows, ...orphanRows];
    all.sort((a, b) => {
      const dateA = a.obs[0]?.effectiveDateTime;
      const dateB = b.obs[0]?.effectiveDateTime;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      return timeB - timeA; // 降序排序（新的在前）
    });
    return all;
  }, [reportRows, orphanRows]);

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Loading reports...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-600">
          Error loading reports: {error?.message || 'Unknown error'}
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No reports available
        </CardContent>
      </Card>
    )
  }

  const defaultOpen = rows.slice(0, 2).map(r => r.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
          {rows.map((row) => (
            <AccordionItem 
              key={row.id} 
              value={row.id} 
              className="border rounded-md px-2 mb-2"
            >
              <AccordionTrigger className="py-3">
                <div className="flex flex-col items-start text-left">
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">{row.meta}</div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-3">
                  {row.obs.map((obs, i) => (
                    <ObservationBlock 
                      key={obs.id ? `obs-${obs.id}` : `obs-${i}`} 
                      o={obs} 
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
