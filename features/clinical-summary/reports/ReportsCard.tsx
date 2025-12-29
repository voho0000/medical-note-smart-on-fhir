// features/clinical-summary/components/ReportsCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/src/shared/utils/cn.utils"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

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
  conclusion?: string;
  conclusionCode?: CodeableConcept[];
  note?: { text?: string }[];
  presentedForm?: { title?: string; contentType?: string }[];
  // provider 會塞進來的展開欄位
  _observations?: Observation[];
}

type ReportGroup = "lab" | "imaging" | "procedures" | "other"

type Row = { id: string; title: string; meta: string; obs: Observation[]; group: ReportGroup }

function ccText(cc?: CodeableConcept) {
  return cc?.text || cc?.coding?.[0]?.display || cc?.coding?.[0]?.code || "—"
}

function conceptText(input?: CodeableConcept | CodeableConcept[]) {
  if (!input) return "—"
  if (Array.isArray(input)) {
    return input.map(ccText).filter(Boolean).join(", ") || "—"
  }
  return ccText(input)
}

function collectCategoryTokens(input?: CodeableConcept | CodeableConcept[]) {
  const concepts = Array.isArray(input) ? input : input ? [input] : []
  const tokens = new Set<string>()
  for (const concept of concepts) {
    if (concept?.text) tokens.add(concept.text.toLowerCase())
    concept?.coding?.forEach((coding) => {
      if (coding?.code) tokens.add(coding.code.toLowerCase())
      if (coding?.display) tokens.add(coding.display.toLowerCase())
      if (coding?.system) tokens.add(coding.system.toLowerCase())
    })
  }
  return tokens
}

function inferGroupFromCategory(category?: CodeableConcept | CodeableConcept[]): ReportGroup {
  const tokens = collectCategoryTokens(category)
  const tokenArray = Array.from(tokens)
  if (tokenArray.some((token) => token.includes("lab") || token.includes("laboratory") || token.includes("chemistry") || token.includes("hematology"))) {
    return "lab"
  }
  if (tokenArray.some((token) => token.includes("img") || token.includes("imaging") || token.includes("radiology") || token.includes("ct") || token.includes("mri") || token.includes("x-ray") || token.includes("ultrasound"))) {
    return "imaging"
  }
  return "other"
}

function inferGroupFromObservation(observation?: Observation): ReportGroup {
  if (!observation) return "other"
  const group = inferGroupFromCategory(observation.category)
  if (group !== "other") return group
  const codeText = ccText(observation.code).toLowerCase()
  if (codeText.includes("x-ray") || codeText.includes("ct") || codeText.includes("mri") || codeText.includes("ultrasound")) {
    return "imaging"
  }
  if (codeText.includes("lab") || codeText.includes("panel") || codeText.includes("blood")) {
    return "lab"
  }
  return "other"
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
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()

  // 將 DR 轉成 rows，並記錄已出現之 Observation IDs
  const { reportRows, seenIds } = useMemo(() => {
    const rows: Row[] = [];
    const seen = new Set<string>();
    
    (diagnosticReports as DiagnosticReport[]).forEach((dr) => {
      if (!dr) return;
      
      const obs = Array.isArray(dr._observations) 
        ? dr._observations.filter((o): o is Observation => !!o)
        : [];

      obs.forEach(o => { 
        if (o?.id) seen.add(o.id);
      });
      
      if (obs.length === 0 && !dr.conclusion && !dr.note?.length) return;

      const category = Array.isArray(dr.category) 
        ? dr.category.map(c => ccText(c)).filter(Boolean).join(', ')
        : ccText(dr.category);

      const summaryParts: string[] = []
      const conclusionText = dr.conclusion?.trim()
      const conclusionCodes = conceptText(dr.conclusionCode)
      const notes = Array.isArray(dr.note)
        ? dr.note.map((n: any) => n?.text).filter(Boolean)
        : []
      if (conclusionText) summaryParts.push(`Conclusion: ${conclusionText}`)
      if (conclusionCodes && conclusionCodes !== "—") summaryParts.push(`Conclusion Codes: ${conclusionCodes}`)
      if (notes.length > 0) summaryParts.push(notes.join("\n"))

      const attachments = Array.isArray(dr.presentedForm)
        ? dr.presentedForm
            .map((form: any) => form?.title || form?.contentType)
            .filter(Boolean)
        : []

      const summaryComponents: ObsComponent[] = []
      if (attachments.length > 0) {
        summaryComponents.push({
          code: { text: "Attachments" },
          valueString: attachments.join(", ")
        })
      }

      const obsWithSummary = [...obs]
      if (summaryParts.length > 0 || attachments.length > 0) {
        const summaryObservation: Observation = {
          resourceType: "Observation",
          id: dr.id ? `dr-summary-${dr.id}` : `dr-summary-${Math.random().toString(36).slice(2, 10)}`,
          code: { text: "Report Summary" },
          valueString: summaryParts.join("\n\n") || "Supporting documents available",
          effectiveDateTime: dr.effectiveDateTime || dr.issued,
          status: dr.status,
          component: summaryComponents,
        }
        obsWithSummary.unshift(summaryObservation)
      }
      
      rows.push({
        id: dr.id || Math.random().toString(36),
        title: ccText(dr.code) || "Unnamed Report",
        meta: `${category || "Laboratory"} • ${dr.status || "—"} • ${fmtDate(dr.issued || dr.effectiveDateTime)}`,
        obs: obsWithSummary,
        group: inferGroupFromCategory(dr.category)
      });
    });
    
    return { reportRows: rows, seenIds: seen };
  }, [diagnosticReports]);

  // 找出沒有掛在 DR 的「孤兒」Observation（常見：生化），做分組
  const orphanRows: Row[] = useMemo(() => {
    if (!Array.isArray(observations)) return [];
    
    // 1) 篩掉已在 DR 內者
    const orphan = observations.filter((o) => 
      (!o.id || !seenIds.has(o.id))
    ) as Observation[];

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
        group: inferGroupFromObservation(first)
      }
    })
  }, [observations, seenIds])

  // 合併並按時間排序（新→舊）
  const procedureRows: Row[] = useMemo(() => {
    if (!Array.isArray(procedures)) return []

    return procedures.map((procedure: any) => {
      const title = ccText(procedure?.code) || "Procedure"
      const performed = procedure?.performedDateTime || procedure?.performedPeriod?.start
      const performer = Array.isArray(procedure?.performer)
        ? procedure.performer
            .map((p: any) => p?.actor?.display || p?.actor?.reference)
            .filter(Boolean)
            .join(", ")
        : undefined
      const outcome = conceptText(procedure?.outcome)
      const category = conceptText(procedure?.category)
      const location = procedure?.location?.display
      const reason = conceptText(procedure?.reasonCode)
      const bodySite = conceptText(procedure?.bodySite)
      const followUp = conceptText(procedure?.followUp)
      const notes = Array.isArray(procedure?.note)
        ? procedure.note.map((n: any) => n?.text).filter(Boolean).join("\n")
        : undefined
      const reports = Array.isArray(procedure?.report)
        ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
        : []

      const components: ObsComponent[] = []
      components.push({ code: { text: "Status" }, valueString: procedure?.status || "—" })
      if (performed) {
        components.push({ code: { text: "Performed On" }, valueString: fmtDate(performed) })
      }
      if (performer) {
        components.push({ code: { text: "Performer" }, valueString: performer })
      }
      if (category && category !== "—") {
        components.push({ code: { text: "Category" }, valueString: category })
      }
      if (reason && reason !== "—") {
        components.push({ code: { text: "Reason" }, valueString: reason })
      }
      if (outcome && outcome !== "—") {
        components.push({ code: { text: "Outcome" }, valueString: outcome })
      }
      if (location) {
        components.push({ code: { text: "Location" }, valueString: location })
      }
      if (bodySite && bodySite !== "—") {
        components.push({ code: { text: "Body Site" }, valueString: bodySite })
      }
      if (followUp && followUp !== "—") {
        components.push({ code: { text: "Follow Up" }, valueString: followUp })
      }
      if (reports.length > 0) {
        components.push({ code: { text: "Reports" }, valueString: reports.join(", ") })
      }
      if (notes) {
        components.push({ code: { text: "Notes" }, valueString: notes })
      }

      const observation: Observation = {
        resourceType: "Observation",
        id: procedure?.id ? `procedure-${procedure.id}` : `procedure-${Math.random().toString(36).slice(2, 10)}`,
        code: { text: "Procedure Summary" },
        valueString: outcome !== "—" ? outcome : notes || "Expand to view procedure details",
        effectiveDateTime: performed,
        status: procedure?.status,
        category: procedure?.category,
        component: components,
      }

      return {
        id: procedure?.id || `procedure-row-${Math.random().toString(36).slice(2, 10)}`,
        title,
        meta: `Procedure • ${procedure?.status || "—"} • ${fmtDate(performed)}`,
        obs: [observation],
        group: "procedures" as const
      }
    })
  }, [procedures])

  const rows: Row[] = useMemo(() => {
    const all = [...reportRows, ...orphanRows, ...procedureRows];
    all.sort((a, b) => {
      const dateA = a.obs[0]?.effectiveDateTime;
      const dateB = b.obs[0]?.effectiveDateTime;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      return timeB - timeA; // 降序排序（新的在前）
    });
    return all;
  }, [reportRows, orphanRows, procedureRows]);

  const groupedRows = useMemo(() => {
    const lab = rows.filter((row) => row.group === "lab")
    const imaging = rows.filter((row) => row.group === "imaging")
    const proceduresOnly = rows.filter((row) => row.group === "procedures")
    const other = rows.filter((row) => row.group === "other")
    return {
      all: rows,
      lab,
      imaging,
      procedures: proceduresOnly,
      other,
    }
  }, [rows])

  const tabConfigs = useMemo(() => {
    const configs = [
      { value: "all", label: `All (${groupedRows.all.length})`, rows: groupedRows.all },
      { value: "lab", label: `Labs (${groupedRows.lab.length})`, rows: groupedRows.lab },
      { value: "imaging", label: `Imaging (${groupedRows.imaging.length})`, rows: groupedRows.imaging },
      { value: "procedures", label: `Procedures (${groupedRows.procedures.length})`, rows: groupedRows.procedures },
    ]
    return configs.filter((config) => config.value === "all" || config.rows.length > 0)
  }, [groupedRows])

  type ObservationBlockProps = {
    observation: Observation
  }

  function ObservationBlock({ observation }: ObservationBlockProps) {
    const title = ccText(observation.code)
    const interp = getInterpTag(observation.interpretation)
    const ref = refRangeText(observation.referenceRange)
    const primaryValue = observation.valueQuantity
      ? valueWithUnit(observation.valueQuantity)
      : observation.valueString || "—"

    return (
      <div className="rounded-lg border p-3 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{fmtDate(observation.effectiveDateTime)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-base font-semibold", interp && "text-foreground")}>{primaryValue}</span>
              {interp && (
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", interp.style)}>
                  {interp.label}
                </span>
              )}
            </div>
          </div>

          {ref && <div className="text-xs text-muted-foreground">{ref}</div>}

          {Array.isArray(observation.component) && observation.component.length > 0 && (
            <div className="mt-2 divide-y rounded-md border bg-muted/40">
              {observation.component.map((component, idx) => {
                const name = ccText(component.code)
                const value = component.valueQuantity
                  ? valueWithUnit(component.valueQuantity)
                  : component.valueString || "—"
                const componentInterp = getInterpTag(component.interpretation)
                const range = refRangeText(component.referenceRange)

                return (
                  <div key={idx} className="grid gap-1 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold", componentInterp && "text-foreground")}>{value}</span>
                        {componentInterp && (
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", componentInterp.style)}>
                            {componentInterp.label}
                          </span>
                        )}
                      </div>
                    </div>
                    {range && <div className="text-xs text-muted-foreground">{range}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-2">
            {tabConfigs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="capitalize">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabConfigs.map((tab) => {
            const filteredRows = tab.rows
            const defaultOpen = filteredRows.slice(0, 2).map((r) => r.id)
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                {filteredRows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No reports available in this category.</div>
                ) : (
                  <div className="w-full space-y-2">
                    {filteredRows.map((row) => {
                      // 如果只有一個 observation 且沒有 component，直接顯示
                      const isSingleSimpleObs = row.obs.length === 1 && 
                        (!row.obs[0].component || row.obs[0].component.length === 0)
                      
                      if (isSingleSimpleObs) {
                        return (
                          <div key={row.id} className="border rounded-lg bg-muted/40 p-3">
                            <div className="flex w-full flex-col gap-1 mb-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">{row.title}</span>
                                <Badge variant="outline" className="text-xs font-normal">{row.meta}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {row.obs[0]?.status && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="font-medium text-foreground/80">Status:</span> {row.obs[0]?.status}
                                  </span>
                                )}
                                {row.obs[0]?.category && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="font-medium text-foreground/80">Category:</span> {conceptText(row.obs[0]?.category)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ObservationBlock observation={row.obs[0]} />
                          </div>
                        )
                      }
                      
                      // 多個 observations 或有 component 的，使用 Accordion
                      return (
                        <Accordion key={row.id} type="multiple" defaultValue={defaultOpen.includes(row.id) ? [row.id] : []} className="w-full">
                          <AccordionItem
                            value={row.id}
                            className="border rounded-lg bg-muted/40 px-3"
                          >
                            <AccordionTrigger className="py-3">
                              <div className="flex w-full flex-col gap-1 text-left">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-foreground">{row.title}</span>
                                  <Badge variant="outline" className="text-xs font-normal">{row.meta}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {row.obs[0]?.status && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="font-medium text-foreground/80">Status:</span> {row.obs[0]?.status}
                                    </span>
                                  )}
                                  {row.obs[0]?.category && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="font-medium text-foreground/80">Category:</span> {conceptText(row.obs[0]?.category)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <div className="grid gap-3">
                                {row.obs.map((obs, i) => (
                                  <ObservationBlock
                                    key={obs.id ? `obs-${obs.id}` : `obs-${i}`}
                                    observation={obs}
                                  />
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}