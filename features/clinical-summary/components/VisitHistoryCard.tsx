// features/clinical-summary/components/VisitHistoryCard.tsx
"use client"

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

type EncounterTest = {
  id: string
  name: string
  status?: string
  dateLabel?: string
  source: "diagnosticReport" | "observation"
}

type EncounterDetails = {
  medications: EncounterMedication[]
  tests: EncounterTest[]
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
        map.set(encounterId, { medications: [], tests: [] })
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
        const testId = report?.id || `${encounterId}-report-${entry.tests.length}`
        if (entry.tests.some((item) => item.id === testId)) return

        entry.tests.push({
          id: testId,
          name: getCodeText(report?.code) || "檢查報告",
          status: report?.status,
          dateLabel: formatDateTime(report?.issued || report?.effectiveDateTime),
          source: "diagnosticReport",
        })
      })
    }

    if (Array.isArray(observations)) {
      observations.forEach((obs: any) => {
        const encounterId = getReferenceId(obs?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const obsId = obs?.id || `${encounterId}-obs-${entry.tests.length}`
        if (entry.tests.some((item) => item.id === obsId)) return

        const value =
          obs?.valueQuantity?.value != null
            ? `${obs.valueQuantity.value}${obs.valueQuantity.unit ? ` ${obs.valueQuantity.unit}` : ""}`
            : obs?.valueString

        entry.tests.push({
          id: obsId,
          name: value ? `${getCodeText(obs?.code) || "檢驗"} (${value})` : getCodeText(obs?.code) || "檢驗",
          status: obs?.status,
          dateLabel: formatDateTime(obs?.effectiveDateTime),
          source: "observation",
        })
      })
    }

    return map
  }, [medications, diagnosticReports, observations])

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
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">Tests</div>
                              <div className="mt-1 space-y-2">
                                {details.tests.map((test) => (
                                  <div key={test.id} className="rounded-md bg-background/60 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-medium text-sm">{test.name}</span>
                                      {test.dateLabel && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">{test.dateLabel}</span>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {test.status && <span className="uppercase tracking-wide">{test.status}</span>}
                                      <span>{test.source === "diagnosticReport" ? "Report" : "Observation"}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {details?.medications.length ? (
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">Medications</div>
                              <div className="mt-1 space-y-2">
                                {details.medications.map((med) => (
                                  <div key={med.id} className="rounded-md bg-background/60 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-medium text-sm">{med.name}</span>
                                      {med.when && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">{med.when}</span>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {med.status && <span className="uppercase tracking-wide">{med.status}</span>}
                                    </div>
                                    {med.detail && (
                                      <div className="mt-1 text-xs text-muted-foreground">{med.detail}</div>
                                    )}
                                  </div>
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