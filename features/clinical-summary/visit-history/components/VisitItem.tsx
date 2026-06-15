"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { EncounterObservationCard } from "./EncounterObservationCard"
import { MedicationRow, ProcedureRow, DiagnosisTag } from "./EncounterCards"
import { AnalyteTrendRow } from "./AnalyteTrendRow"
import { MedTrendRow } from "./MedTrendRow"
import { EncounterSection } from "./EncounterSection"
// import { NoteItem } from "./NoteItem" // TODO: 暫時隱藏，等有真實資料時再啟用測試
import { DocumentDetailDialog } from "@/features/clinical-summary/document-summary/components/DocumentDetailDialog"
import { useDocumentSummaryStrings, makeResolveSectionLabel } from "@/features/clinical-summary/document-summary/utils/strings"
import type { DocumentEntry } from "@/features/clinical-summary/document-summary/types"
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
  /** Documents linked to this visit's Encounter (e.g. 出院病摘 / discharge
   *  summary) — surfaced inline so the user can open the full text from the
   *  visit without hunting through the 文件 tab. */
  documents?: DocumentEntry[]
  abnormalCount?: number
  isExpanded: boolean
  onToggle: () => void
}

const getTypeBadge = (type: VisitType, labels: any) => {
  // Soft pastel tints (light bg + same-hue border/text) so the type badge sits
  // in the same visual register as the rest of the UI's chips. The earlier
  // solid blue / red / amber badges were too heavy against the light layout.
  // 門診 blue · 急診 rose · 住院 violet — still distinct at a glance.
  const typeMap: Record<VisitType, { label: string; className: string }> = {
    outpatient: { label: labels.outpatient, className: 'border-blue-200 bg-blue-50 text-blue-700' },
    inpatient:  { label: labels.inpatient,  className: 'border-violet-200 bg-violet-50 text-violet-700' },
    emergency:  { label: labels.emergency,  className: 'border-rose-200 bg-rose-50 text-rose-700' },
    home:       { label: labels.home,       className: '' },
    virtual:    { label: labels.virtual,    className: '' },
    pharmacy:   { label: labels.pharmacy || '藥局', className: '' },
    other:      { label: labels.other,      className: '' },
  }
  const { label, className } = typeMap[type] || typeMap.other
  return <Badge variant="outline" className={className || undefined}>{label}</Badge>
}

export function VisitItem({ visit, details, documents, abnormalCount = 0, isExpanded, onToggle }: VisitItemProps) {
  const { t, locale } = useLanguage()
  const docStrings = useDocumentSummaryStrings()
  const resolveDocSectionLabel = makeResolveSectionLabel(docStrings)
  const categoryLabel = (id: string): string =>
    (t.reports.cumulativeCategories as Record<string, string>)[id] || id
  const reasonCodes = visit.icdCodes
  const hasIcdCodes = reasonCodes.length > 0 && /^[A-Z]\d/.test(reasonCodes[0].code)
  const hasSecondaryIcds = hasIcdCodes && reasonCodes.length > 1
  const [icdExpanded, setIcdExpanded] = useState(false)
  const docs = documents ?? []
  const hasDetails = !!(docs.length > 0 || (details && (
    details.diagnoses.length > 0 ||
    details.medications.length > 0 ||
    details.tests.length > 0 ||
    details.procedures.length > 0
    // || details.clinicalNotes.length > 0 // TODO: 暫時隱藏病歷記錄判斷
  )))

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
        className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
      >
        {/* Header: when/where on the left, the at-a-glance count pills pushed
            to the right (justify-between), then the expand chevron. A collapsed
            visit stays ~2 short rows. The pills live in their own right cluster
            that wraps INTERNALLY (max-w cap) when they're many/wide, so the
            left date never gets orphaned onto its own line. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0">
            {getTypeBadge(visit.type, t.visitHistory.badges)}
            {visit.location && (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                {visit.location}
              </span>
            )}
            <span className="font-medium">{formatDateUtil(visit.date, locale)}</span>
            {visit.department && (
              <span className="text-xs text-muted-foreground">· {visit.department}</span>
            )}
            {/* The i18n label already ends with a colon (主治醫師：/ Physician:) */}
            {visit.physician && (
              <span className="text-xs text-muted-foreground">{t.visitHistory.physician} {visit.physician}</span>
            )}
            {visit.status === "in-progress" && (
              <Badge variant="outline" className="border-green-500 text-green-700">
                {t.visitHistory.inProgress}
              </Badge>
            )}
          </div>
          {/* Right cluster: count pills (right-aligned, separated from the left
              content) + the expand chevron. */}
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-1 max-w-[55%]">
            {details && (
              <>
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
              </>
            )}
            {/* Discharge-summary indicator — at-a-glance marker that this visit
                has a linked 出院病摘 to open in the expanded view. */}
            {docs.length > 0 && (
              <span
                title={docStrings.dischargeBadgeTooltip}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
              >
                {docStrings.dischargeBadge}
              </span>
            )}
            <span
              className="text-xs text-muted-foreground leading-5"
              title={hasDetails ? (isExpanded ? t.visitHistory.hideDetails : t.visitHistory.viewDetails) : t.visitHistory.noDetails}
            >
              {hasDetails ? (isExpanded ? "▲" : "▼") : ""}
            </span>
          </div>
        </div>

        {(visit.reason || visit.diagnosis) && (
          <div className="mt-1.5 space-y-1 text-sm">
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

      </div>

      {isExpanded && (
        <div className="border-t bg-muted/30 px-3 py-3 text-sm">
          {hasDetails ? (
            <div className="space-y-4">
              {/* Linked documents (出院病摘 / discharge summary). The popout
                  button opens the full text in the shared DocumentDetailDialog
                  — same reader as the 文件 tab. */}
              {docs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {docStrings.dischargeBadge}
                  </div>
                  <div className="grid gap-2">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 shadow-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{doc.typeLabel}</div>
                          {(doc.subtitle || doc.institution) && (
                            <div className="truncate text-xs text-muted-foreground">
                              {doc.subtitle || doc.institution}
                            </div>
                          )}
                        </div>
                        <DocumentDetailDialog
                          entry={doc}
                          strings={docStrings}
                          resolveSectionLabel={resolveDocSectionLabel}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                        {/* Render a label for EVERY group — categorised
                            ones use the cumulativeCategories i18n entry;
                            uncategorised ones fall back to "其他" so the
                            tests don't visually attach to the previous
                            group's header. */}
                        <div className="px-0.5 text-[11px] font-medium text-muted-foreground/80">
                          {group.categoryId
                            ? categoryLabel(group.categoryId)
                            : categoryLabel('other')}
                        </div>
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
                  <div className="grid gap-1.5 mt-2">
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
