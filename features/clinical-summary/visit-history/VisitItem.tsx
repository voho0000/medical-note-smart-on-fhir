"use client"

import { Badge } from "@/components/ui/badge"
import { EncounterObservationCard } from "./EncounterObservationCard"
import { MedicationRow, ProcedureRow } from "./EncounterCards"
import type { VisitRecord } from "./hooks/useVisitHistory"
import type { EncounterDetails } from "./hooks/useEncounterDetails"

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'other'

interface VisitItemProps {
  visit: VisitRecord
  details?: EncounterDetails
  isExpanded: boolean
  onToggle: () => void
}

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

export function VisitItem({ visit, details, isExpanded, onToggle }: VisitItemProps) {
  const hasDetails = !!(details && (details.medications.length > 0 || details.tests.length > 0 || details.procedures.length > 0))

  return (
    <div className="rounded-lg border transition-colors">
      <button
        type="button"
        onClick={onToggle}
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
                <span className="font-medium text-muted-foreground">Reason: </span>
                <span>{visit.reason}</span>
              </div>
            )}
            {visit.diagnosis && (
              <div>
                <span className="font-medium text-muted-foreground">Diagnosis: </span>
                <span>{visit.diagnosis}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hasDetails
              ? isExpanded
                ? "Hide tests & medications"
                : "View tests & medications"
              : "No tests or medications"}
          </span>
          <span>{hasDetails ? (isExpanded ? "▲" : "▼") : "-"}</span>
        </div>
      </button>

      {isExpanded && (
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
}
