"use client"

import { Badge } from "@/components/ui/badge"
import { EncounterObservationCard } from "./EncounterObservationCard"
import { MedicationRow, ProcedureRow } from "./EncounterCards"
// import { NoteItem } from "./NoteItem" // TODO: 暫時隱藏，等有真實資料時再啟用測試
import type { VisitRecord } from "../hooks/useVisitHistory"
import type { EncounterDetails } from "../hooks/useEncounterDetails"
import { useLanguage } from "@/src/application/providers/language.provider"
import { formatDate as formatDateUtil } from "@/src/shared/utils/date.utils"

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'other'

interface VisitItemProps {
  visit: VisitRecord
  details?: EncounterDetails
  isExpanded: boolean
  onToggle: () => void
}

const getTypeBadge = (type: VisitType, labels: any) => {
  const typeMap = {
    outpatient: { label: labels.outpatient, variant: "default" as const },
    inpatient: { label: labels.inpatient, variant: 'secondary' as const },
    emergency: { label: labels.emergency, variant: 'destructive' as const },
    home: { label: labels.home, variant: 'outline' as const },
    virtual: { label: labels.virtual, variant: 'outline' as const },
    other: { label: labels.other, variant: 'outline' as const }
  }
  const { label, variant } = typeMap[type] || typeMap.other
  return <Badge variant={variant}>{label}</Badge>
}

export function VisitItem({ visit, details, isExpanded, onToggle }: VisitItemProps) {
  const { t, locale } = useLanguage()
  const hasDetails = !!(details && (
    details.medications.length > 0 || 
    details.tests.length > 0 || 
    details.procedures.length > 0
    // || details.clinicalNotes.length > 0 // TODO: 暫時隱藏病歷記錄判斷
  ))

  return (
    <div className="rounded-lg border transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            {getTypeBadge(visit.type, t.visitHistory.badges)}
            <div className="flex flex-col">
              <span className="font-medium">{formatDateUtil(visit.date, locale)}</span>
              {visit.department && (
                <span className="text-xs text-muted-foreground">{visit.department}</span>
              )}
              {visit.physician && (
                <span className="text-xs text-muted-foreground">{t.visitHistory.physician}: {visit.physician}</span>
              )}
            </div>
            {visit.status === "in-progress" && (
              <Badge variant="outline" className="border-green-500 text-green-700">
                {t.visitHistory.inProgress}
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
                <span className="font-medium text-muted-foreground">{t.visitHistory.reason}: </span>
                <span>{visit.reason}</span>
              </div>
            )}
            {visit.diagnosis && (
              <div>
                <span className="font-medium text-muted-foreground">{t.visitHistory.diagnosis}: </span>
                <span>{visit.diagnosis}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hasDetails
              ? isExpanded
                ? t.visitHistory.hideDetails
                : t.visitHistory.viewDetails
              : t.visitHistory.noDetails}
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.visitHistory.tests}</div>
                  <div className="grid gap-2">
                    {details.tests.map((test) => (
                      <EncounterObservationCard key={test.id} observation={test} />
                    ))}
                  </div>
                </div>
              ) : null}

              {details?.medications.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.visitHistory.medications}</div>
                  <div className="grid gap-2">
                    {details.medications.map((med) => (
                      <MedicationRow key={med.id} medication={med} />
                    ))}
                  </div>
                </div>
              ) : null}

              {details?.procedures.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.visitHistory.procedures}</div>
                  <div className="grid gap-2">
                    {details.procedures.map((procedure) => (
                      <ProcedureRow key={procedure.id} procedure={procedure} />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* TODO: 病歷記錄功能暫時隱藏，等 FHIR 服務器提供真實資料後再啟用測試
              {details?.clinicalNotes.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.clinicalNotes.title}</div>
                  <div className="grid gap-2">
                    {details.clinicalNotes.map((note) => (
                      <NoteItem key={note.id} note={note} />
                    ))}
                  </div>
                </div>
              ) : null}
              */}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{t.visitHistory.noDetailsExpanded}</div>
          )}
        </div>
      )}
    </div>
  )
}
