"use client"
import { cn } from "@/lib/utils"
// features/clinical-summary/components/VisitHistoryCard.tsx
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useMemo, useState } from "react"

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'other'

interface VisitRecord {
  id: string
  type: VisitType
  date: string
  location?: string
  reason?: string
  diagnosis?: string
  status: string
  department?: string  // 新增科別欄位
  physician?: string
}

type EncounterMedication = {
  id: string
  name: string
  status?: string
  detail?: string
  when?: string
}

type Coding = { system?: string; code?: string; display?: string }
type Quantity = { value?: number; unit?: string }
type CodeableConcept = { text?: string; coding?: Coding[] }
type ReferenceRange = { low?: Quantity; high?: Quantity; text?: string }

type EncounterObservationComponent = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
}

type EncounterObservation = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  effectiveDateTime?: string
  status?: string
  source: "diagnosticReport" | "observation"
  components: EncounterObservationComponent[]
}

type EncounterProcedure = {
  id: string
  title: string
  status?: string
  performed?: string
  performer?: string
  category?: string
  outcome?: string
  report: string[]
}

type EncounterDetails = {
  medications: EncounterMedication[]
  tests: EncounterObservation[]
  procedures: EncounterProcedure[]
}

const qty = (q?: Quantity) => {
  if (!q || q.value == null) return "—"
  return `${q.value}${q.unit ? ` ${q.unit}` : ""}`
}

const valueWithUnit = (value?: Quantity, fallback?: string) => {
  if (value && value.value != null) return qty(value)
  return fallback ?? "—"
}

const refRangeText = (ranges?: ReferenceRange[]) => {
  if (!ranges?.length) return ""
  const range = ranges[0]
  if (range.text) return `Ref: ${range.text}`
  const low = range.low?.value
  const high = range.high?.value
  const unit = range.low?.unit || range.high?.unit
  if (low != null && high != null) return `Ref: ${low}–${high}${unit ? ` ${unit}` : ""}`
  if (low != null) return `Ref: ≥${low}${unit ? ` ${unit}` : ""}`
  if (high != null) return `Ref: ≤${high}${unit ? ` ${unit}` : ""}`
  return ""
}

const getInterpTag = (concept?: CodeableConcept) => {
  const raw = concept?.coding?.[0]?.code || concept?.coding?.[0]?.display || concept?.text || ""
  const code = raw?.toString().toUpperCase()
  if (!code) return null
  if (["H", "HI", "HIGH", "ABOVE", ">", "HH", "CRIT-HI"].includes(code)) {
    return { label: code === "HH" ? "Critical High" : "High", style: "bg-red-100 text-red-700 border border-red-200" }
  }
  if (["L", "LO", "LOW", "BELOW", "<", "LL", "CRIT-LO"].includes(code)) {
    return { label: code === "LL" ? "Critical Low" : "Low", style: "bg-blue-100 text-blue-700 border border-blue-200" }
  }
  if (["A", "ABN", "ABNORMAL"].includes(code)) {
    return { label: "Abnormal", style: "bg-amber-100 text-amber-700 border border-amber-200" }
  }
  if (["POS", "POSITIVE", "DETECTED", "REACTIVE"].includes(code)) {
    return { label: "Positive", style: "bg-orange-100 text-orange-700 border border-orange-200" }
  }
  if (["NEG", "NEGATIVE", "NOT DETECTED", "NONREACTIVE"].includes(code)) {
    return { label: "Negative", style: "bg-emerald-100 text-emerald-700 border border-emerald-200" }
  }
  if (["N", "NORMAL"].includes(code)) {
    return { label: "Normal", style: "bg-gray-100 text-gray-600 border border-gray-200" }
  }
  return { label: code, style: "bg-muted text-muted-foreground" }
}

const toEncounterObservation = (observation: any, source: "diagnosticReport" | "observation"): EncounterObservation => {
  const title = getCodeText(observation?.code) || "Observation"
  const interpretation = getInterpTag(observation?.interpretation)
  const referenceText = refRangeText(observation?.referenceRange)
  const components = Array.isArray(observation?.component)
    ? observation.component.map((component: any, index: number): EncounterObservationComponent => {
        const componentInterpretation = getInterpTag(component?.interpretation)
        return {
          id: component?.id || `${observation?.id || "component"}-${index}`,
          title: getCodeText(component?.code) || "Component",
          value: component?.valueQuantity
            ? valueWithUnit(component.valueQuantity)
            : component?.valueString || "—",
          interpretationLabel: componentInterpretation?.label,
          interpretationStyle: componentInterpretation?.style,
          referenceText: refRangeText(component?.referenceRange),
        }
      })
    : []

  return {
    id: observation?.id || `${source}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    value: observation?.valueQuantity
      ? valueWithUnit(observation.valueQuantity)
      : observation?.valueString || "—",
    interpretationLabel: interpretation?.label,
    interpretationStyle: interpretation?.style,
    referenceText,
    effectiveDateTime: observation?.effectiveDateTime,
    status: observation?.status,
    source,
    components,
  }
}

function EncounterObservationCard({ observation }: { observation: EncounterObservation }) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">{observation.title}</div>
            <div className="text-xs text-muted-foreground">{observation.effectiveDateTime ? formatDateTime(observation.effectiveDateTime) : observation.source === "diagnosticReport" ? "Diagnostic report" : "Observation"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">{observation.value}</span>
            {observation.interpretationLabel && observation.interpretationStyle && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", observation.interpretationStyle)}>
                {observation.interpretationLabel}
              </span>
            )}
          </div>
        </div>

        {observation.referenceText && <div className="text-xs text-muted-foreground">{observation.referenceText}</div>}

        {observation.components.length > 0 && (
          <div className="mt-2 divide-y rounded-md border bg-muted/40">
            {observation.components.map((component) => (
              <div key={component.id} className="grid gap-1 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{component.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{component.value}</span>
                    {component.interpretationLabel && component.interpretationStyle && (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", component.interpretationStyle)}>
                        {component.interpretationLabel}
                      </span>
                    )}
                  </div>
                </div>
                {component.referenceText && <div className="text-xs text-muted-foreground">{component.referenceText}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProcedureRow({ procedure }: { procedure: EncounterProcedure }) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{procedure.title}</span>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {procedure.category && <span>{procedure.category}</span>}
            {procedure.outcome && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground/80">Outcome:</span> {procedure.outcome}
              </span>
            )}
          </div>
          {procedure.report.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Reports: {procedure.report.join(", ")}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {procedure.performed && <span className="text-xs text-muted-foreground">{formatDateTime(procedure.performed)}</span>}
          {procedure.performer && <span className="text-xs text-muted-foreground">By {procedure.performer}</span>}
          {procedure.status && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize border-purple-200 bg-purple-50 text-purple-700">
              {procedure.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MedicationRow({ medication }: { medication: EncounterMedication }) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{medication.name}</span>
          {medication.detail && <span className="text-xs text-muted-foreground">{medication.detail}</span>}
        </div>
        <div className="flex flex-col items-end text-right gap-1">
          {medication.when && <span className="text-xs text-muted-foreground">{medication.when}</span>}
          {medication.status && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize", medication.status === "active" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-muted bg-muted/60 text-muted-foreground")}>{medication.status}</span>
          )}
        </div>
      </div>
    </div>
  )
}

const getReferenceId = (ref: any): string | null => {
  if (!ref) return null
  if (typeof ref === "string") {
    return ref.split("/").pop() || null
  }
  if (typeof ref === "object" && typeof ref.reference === "string") {
    return ref.reference.split("/").pop() || null
  }
  return null
}

const getCodeText = (code?: { text?: string; coding?: Array<{ display?: string; code?: string }> }) => {
  return code?.text || code?.coding?.[0]?.display || code?.coding?.[0]?.code || ""
}

const getMedicationName = (med: any) => {
  return (
    getCodeText(med?.medicationCodeableConcept) ||
    med?.medicationReference?.display ||
    getCodeText(med?.code) ||
    getCodeText(med?.medication) ||
    getCodeText(med?.resource?.code) ||
    "Unnamed medication"
  )
}

const formatDateTime = (dateString?: string) => {
  if (!dateString) return undefined
  try {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
  }
}

export function VisitHistoryCard() {
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    observations = [],
    procedures = [],
    isLoading,
    error,
  } = useClinicalData()
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)

  const visitHistory = useMemo<VisitRecord[]>(() => {
    if (!Array.isArray(encounters)) return []
    
    return encounters
      .filter((encounter: any) => {
        const status = encounter.status
        return status === 'finished' || status === 'in-progress' || status === 'arrived'
      })
      .map((encounter: any) => {
        let type: VisitType = 'other'
        const classCode = encounter.class?.code?.toLowerCase()
        const reasonText = (encounter.reasonCode?.[0]?.text || '').toLowerCase()
        
        // 根據 FHIR encounter class 和 reason 判斷就診類型
        if (classCode === 'ambulatory' || 
            classCode === 'outpatient' || 
            reasonText.includes('prenatal') || 
            reasonText.includes('check up') ||
            reasonText.includes('postnatal')) {
          type = 'outpatient'
        } 
        else if (classCode === 'emergency' || 
                reasonText.includes('emergency')) {
          type = 'emergency'
        }
        else if (classCode === 'inpatient' || 
                reasonText.includes('admission') ||
                reasonText.includes('hospital')) {
          type = 'inpatient'
        }
        else if (classCode === 'home') {
          type = 'home'
        }
        else if (classCode === 'virtual') {
          type = 'virtual'
        }
        
        // Only show location if it's a meaningful display name, not a UUID or reference ID
        let location = encounter.location?.[0]?.location?.display || 
                     (encounter.serviceProvider?.display && 
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(encounter.serviceProvider.display)
                      ? encounter.serviceProvider.display 
                      : '')
        
        const reason = encounter.reasonCode?.[0]?.text || 
                      encounter.reasonReference?.[0]?.display ||
                      encounter.type?.[0]?.text
        
        const diagnosis = encounter.diagnosis?.find((d: any) => d.rank === 1)?.condition?.display ||
                         encounter.diagnosis?.[0]?.condition?.display

        // 如果是門診，嘗試取得科別與醫師資訊
        let department = ''
        let physician = ''
        if (type === 'outpatient') {
          // 從 type.coding 或 type.text 取得科別
          department = encounter.type?.[0]?.coding?.[0]?.display || 
                      encounter.type?.[0]?.text ||
                      encounter.serviceType?.coding?.[0]?.display ||
                      ''
          
          // 如果科別包含「門診」字樣，則移除
          department = department.replace('門診', '').trim()

          const participant = encounter.participant?.find((p: any) => 
            p?.individual?.display || p?.actor?.display
          )
          physician = participant?.individual?.display || participant?.actor?.display || ''
        }

        return {
          id: encounter.id,
          type,
          date: encounter.period?.start || '',
          location,
          reason,
          diagnosis,
          status: encounter.status,
          department: department || undefined,
          physician: physician || undefined
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [encounters])

  const encounterDetails = useMemo(() => {
    const map = new Map<string, EncounterDetails>()

    const ensureEntry = (encounterId: string) => {
      if (!map.has(encounterId)) {
        map.set(encounterId, { medications: [], tests: [], procedures: [] })
      }
      return map.get(encounterId)!
    }

    if (Array.isArray(medications)) {
      medications.forEach((med: any) => {
        const encounterId = getReferenceId(med?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const medId = med?.id || `${encounterId}-med-${entry.medications.length}`
        if (entry.medications.some((item) => item.id === medId)) return

        entry.medications.push({
          id: medId,
          name: getMedicationName(med),
          status: med?.status,
          detail: med?.dosageInstruction?.[0]?.text,
          when: formatDateTime(med?.authoredOn),
        })
      })
    }

    if (Array.isArray(diagnosticReports)) {
      diagnosticReports.forEach((report: any) => {
        const encounterId = getReferenceId(report?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const observations = Array.isArray(report?._observations)
          ? report._observations.filter((obs: any) => obs?.resourceType === "Observation")
          : []

        observations.forEach((obs: any) => {
          const normalized = toEncounterObservation(obs, "diagnosticReport")
          if (entry.tests.some((item) => item.id === normalized.id)) return
          entry.tests.push(normalized)
        })
      })
    }

    if (Array.isArray(observations)) {
      observations.forEach((obs: any) => {
        const encounterId = getReferenceId(obs?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const normalized = toEncounterObservation(obs, "observation")
        if (entry.tests.some((item) => item.id === normalized.id)) return
        entry.tests.push(normalized)
      })
    }

    if (Array.isArray(procedures)) {
      procedures.forEach((procedure: any) => {
        const encounterId = getReferenceId(procedure?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const id = procedure?.id || `${encounterId}-procedure-${entry.procedures.length}`
        if (entry.procedures.some((existing) => existing.id === id)) return

        entry.procedures.push({
          id,
          title: getCodeText(procedure?.code) || "Procedure",
          status: procedure?.status,
          performer: procedure?.performer?.[0]?.actor?.display,
          performed: procedure?.performedDateTime || procedure?.performedPeriod?.start,
          category: getCodeText(procedure?.category),
          outcome: getCodeText(procedure?.outcome),
          report: Array.isArray(procedure?.report)
            ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
            : [],
        })
      })
    }

    return map
  }, [medications, diagnosticReports, observations, procedures])

  const getTypeBadge = (type: VisitType) => {
    const typeMap = {
      outpatient: { label: "Outpatient", variant: "default" as const },
      inpatient: { label: 'Inpatient', variant: 'secondary' as const },
      emergency: { label: 'Emergency', variant: 'destructive' as const },
      home: { label: 'Home Care', variant: 'outline' as const },
      virtual: { label: 'Virtual Visit', variant: 'outline' as const },
      other: { label: 'Visit', variant: 'outline' as const }
    }
    const { label, variant } = typeMap[type] || typeMap.other
    return <Badge variant={variant}>{label}</Badge>
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    } catch {
      return dateString || 'Unknown date'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visit History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-600">
            {error instanceof Error ? error.message : 'Unable to load visit history'}
          </div>
        ) : visitHistory.length === 0 ? (
          <div className="text-sm text-muted-foreground">No visit history available</div>
        ) : (
          <div className="space-y-3">
            {visitHistory.map((visit) => {
              const details = encounterDetails.get(visit.id)
              const hasDetails = !!(
                details && (details.medications.length > 0 || details.tests.length > 0)
              )

              return (
              <div key={visit.id} className="rounded-lg border transition-colors">
                <button
                  type="button"
                  onClick={() => setExpandedVisitId((prev) => (prev === visit.id ? null : visit.id))}
                  className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getTypeBadge(visit.type)}
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDate(visit.date)}</span>
                        {visit.department && (
                          <span className="text-xs text-muted-foreground">{visit.department}</span>
                        )}
                        {visit.physician && (
                          <span className="text-xs text-muted-foreground">Physician: {visit.physician}</span>
                        )}
                      </div>
                      {visit.status === "in-progress" && (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          In progress
                        </Badge>
                      )}
                    </div>
                    {visit.location && (
                      <span className="text-sm text-muted-foreground text-right">
                        {visit.location}
                      </span>
                    )}
                  </div>

                  {(visit.reason || visit.diagnosis) && (
                    <div className="mt-2 space-y-1 text-sm">
                      {visit.reason && (
                        <div>
                          <span className="font-medium text-muted-foreground">Reason:</span>
                          <span>{visit.reason}</span>
                        </div>
                      )}
                      {visit.diagnosis && (
                        <div>
                          <span className="font-medium text-muted-foreground">Diagnosis:</span>
                          <span>{visit.diagnosis}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {hasDetails
                        ? expandedVisitId === visit.id
                          ? "Hide tests & medications"
                          : "View tests & medications"
                        : "No tests or medications"}
                    </span>
                    <span>{hasDetails ? (expandedVisitId === visit.id ? "▲" : "▼") : "-"}</span>
                  </div>
                </button>

                {expandedVisitId === visit.id && (
                  <div className="border-t bg-muted/30 px-3 py-3 text-sm">
                    {hasDetails ? (
                        <div className="space-y-4">
                          {details?.tests.length ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tests</div>
                              <div className="grid gap-2">
                                {details.tests.map((test) => (
                                  <EncounterObservationCard key={test.id} observation={test} />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {details?.medications.length ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medications</div>
                              <div className="grid gap-2">
                                {details.medications.map((med) => (
                                  <MedicationRow key={med.id} medication={med} />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {details?.procedures.length ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procedures</div>
                              <div className="grid gap-2">
                                {details.procedures.map((procedure) => (
                                  <ProcedureRow key={procedure.id} procedure={procedure} />
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No related tests or medications for this visit.</div>
                      )}
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}