"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { EncounterObservationCard } from "./EncounterObservationCard"
import { MedicationRow, ProcedureRow, DiagnosisTag } from "./EncounterCards"
import { AnalyteTrendRow } from "./AnalyteTrendRow"
import { MedTrendRow } from "./MedTrendRow"
import { EncounterSection } from "./EncounterSection"
// import { NoteItem } from "./NoteItem" // TODO: 暫時隱藏，等有真實資料時再啟用測試
import type { VisitRecord } from "../hooks/useVisitHistory"
import type { EncounterDetails } from "../hooks/useEncounterDetails"
import { useLanguage } from "@/src/application/providers/language.provider"
import { formatDate as formatDateUtil } from "@/src/shared/utils/date.utils"

// Auto-collapse thresholds — counts above these flip the section to closed
// by default. Tuned for the typical inpatient stay (50+ labs, 10+ meds)
// while keeping short outpatient visits visible without an extra click.
const COLLAPSE_THRESHOLDS = {
  diagnoses: 6,
  tests: 20,
  medications: 10,
  procedures: Infinity, // procedures are rarely numerous; always show.
} as const

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'pharmacy' | 'other'

interface VisitItemProps {
  visit: VisitRecord
  details?: EncounterDetails
  abnormalCount?: number
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
    pharmacy: { label: labels.pharmacy || '藥局', variant: 'outline' as const },
    other: { label: labels.other, variant: 'outline' as const }
  }
  const { label, variant } = typeMap[type] || typeMap.other
  return <Badge variant={variant}>{label}</Badge>
}

export function VisitItem({ visit, details, abnormalCount = 0, isExpanded, onToggle }: VisitItemProps) {
  const { t, locale } = useLanguage()
  const categoryLabel = (id: string): string =>
    (t.reports.cumulativeCategories as Record<string, string>)[id] || id
  const reasonCodes = visit.icdCodes
  const hasIcdCodes = reasonCodes.length > 0 && /^[A-Z]\d/.test(reasonCodes[0].code)
  const hasSecondaryIcds = hasIcdCodes && reasonCodes.length > 1
  const [icdExpanded, setIcdExpanded] = useState(false)
  const hasDetails = !!(details && (
    details.diagnoses.length > 0 ||
    details.medications.length > 0 ||
    details.tests.length > 0 ||
    details.procedures.length > 0
    // || details.clinicalNotes.length > 0 // TODO: 暫時隱藏病歷記錄判斷
  ))

  return (
    <div className="rounded-lg border transition-colors">
      {/* role="button" instead of <button> so we can nest the +N ICD-expand
          <button> inside without producing invalid HTML (button-in-button
          triggers React hydration error). Keyboard accessibility preserved
          via tabIndex + Enter/Space handler. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {getTypeBadge(visit.type, t.visitHistory.badges)}
            {visit.location && (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                {visit.location}
              </span>
            )}
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
        </div>

        {(visit.reason || visit.diagnosis) && (
          <div className="mt-2 space-y-1 text-sm">
            {visit.reason && (
              <div>
                <span
                  className="font-medium text-muted-foreground"
                  title={(t.visitHistory as any).icdCodesTooltip}
                >
                  {(t.visitHistory as any).recordedIcdCodes ?? t.visitHistory.reason}:{' '}
                </span>
                {hasIcdCodes ? (
                  <span className="inline-flex flex-wrap gap-1 align-middle">
                    {/* Default: primary only. Click "+N" to reveal secondaries inline. */}
                    {(icdExpanded ? reasonCodes : reasonCodes.slice(0, 1)).map((rc, i) => (
                      <span
                        key={`${rc.code}-${i}`}
                        title={(t.visitHistory as any).icdCodesTooltip}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 select-text cursor-text"
                      >
                        <span className="font-mono font-medium">{rc.code}</span>
                        {rc.description && (
                          <span className="text-amber-700/80 max-w-[200px] truncate">
                            {rc.description}
                          </span>
                        )}
                      </span>
                    ))}
                    {hasSecondaryIcds && (
                      <button
                        type="button"
                        title={(t.visitHistory as any).icdCodesTooltip}
                        onClick={(e) => {
                          e.stopPropagation()
                          setIcdExpanded((v) => !v)
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50/60 px-1.5 py-0.5 text-[11px] text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        {icdExpanded ? '−' : `+${reasonCodes.length - 1}`}
                      </button>
                    )}
                  </span>
                ) : (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="select-text cursor-text"
                  >
                    {visit.reason}
                  </span>
                )}
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

        {details && (
          <div className="mt-2 flex flex-wrap gap-1">
            {details.diagnoses.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
                {t.visitHistory.diagnoses} {details.diagnoses.length}
              </span>
            )}
            {details.tests.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                {t.visitHistory.tests} {details.tests.length}
              </span>
            )}
            {abnormalCount > 0 && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                {(t.visitHistory as any).abnormal ?? 'Abnormal'} {abnormalCount}
              </span>
            )}
            {details.medications.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-700">
                {t.visitHistory.medications} {details.medications.length}
              </span>
            )}
            {details.procedures.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700">
                {t.visitHistory.procedures} {details.procedures.length}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hasDetails
              ? isExpanded
                ? t.visitHistory.hideDetails
                : t.visitHistory.viewDetails
              : t.visitHistory.noDetails}
          </span>
          <span>{hasDetails ? (isExpanded ? "▲" : "▼") : "-"}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/30 px-3 py-3 text-sm">
          {hasDetails ? (
            <div className="space-y-4">
              {details?.diagnoses.length ? (
                <EncounterSection
                  title={t.visitHistory.diagnoses}
                  count={details.diagnoses.length}
                  collapseThreshold={COLLAPSE_THRESHOLDS.diagnoses}
                >
                  <div className="grid gap-2 mt-2">
                    {details.diagnoses.map((dx) => (
                      <DiagnosisTag key={dx.id} diagnosis={dx} />
                    ))}
                  </div>
                </EncounterSection>
              ) : null}

              {details?.testGroups.length ? (
                <EncounterSection
                  title={t.visitHistory.tests}
                  count={details.tests.length}
                  collapseThreshold={COLLAPSE_THRESHOLDS.tests}
                  rightBadges={
                    abnormalCount > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0 text-[10px] font-medium text-red-700 normal-case">
                        {(t.visitHistory as any).abnormal ?? 'Abnormal'} {abnormalCount}
                      </span>
                    ) : undefined
                  }
                >
                  <div className="space-y-3 mt-2">
                    {details.testGroups.map((group, gi) => (
                      <div key={group.categoryId ?? `other-${gi}`} className="space-y-1">
                        {group.categoryId && (
                          <div className="px-0.5 text-[11px] font-medium text-muted-foreground/80">
                            {categoryLabel(group.categoryId)}
                          </div>
                        )}
                        {/* Multi-day visits: collapse same-analyte runs into
                            AnalyteTrendRow so 4× HB rows don't look identical.
                            Single-day visits keep the flat card layout. */}
                        {details.isMultiDay && group.testSeries.length > 0 ? (
                          <div className="rounded-lg border bg-muted/40 overflow-hidden">
                            {group.testSeries.map((series) => (
                              <AnalyteTrendRow key={series.id} series={series} />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-muted/40 divide-y overflow-hidden">
                            {group.tests.map((test) => (
                              <EncounterObservationCard
                                key={test.id}
                                observation={test}
                                showDate={details.isMultiDay}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </EncounterSection>
              ) : null}

              {details?.medications.length ? (
                <EncounterSection
                  title={t.visitHistory.medications}
                  count={details.medications.length}
                  collapseThreshold={COLLAPSE_THRESHOLDS.medications}
                >
                  <div className="grid gap-2 mt-2">
                    {/* Multi-day: roll up same-drug refills into MedTrendRow.
                        Single-day: keep flat MedicationRow. */}
                    {details.isMultiDay && details.medSeries.length > 0 ? (
                      details.medSeries.map((s) => (
                        <MedTrendRow key={s.id} series={s} />
                      ))
                    ) : (
                      details.medications.map((med) => (
                        <MedicationRow key={med.id} medication={med} />
                      ))
                    )}
                  </div>
                </EncounterSection>
              ) : null}

              {details?.procedures.length ? (
                <EncounterSection
                  title={t.visitHistory.procedures}
                  count={details.procedures.length}
                  collapseThreshold={COLLAPSE_THRESHOLDS.procedures}
                >
                  <div className="grid gap-2 mt-2">
                    {details.procedures.map((procedure) => (
                      <ProcedureRow key={procedure.id} procedure={procedure} />
                    ))}
                  </div>
                </EncounterSection>
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
