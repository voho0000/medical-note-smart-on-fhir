// The expanded body of a visit (diagnoses / tests / meds / procedures / linked
// documents). Extracted from VisitItem so the SAME content can render either
// inline (向下展開) or in the right-pane detail slot (向右展開).
"use client"

import { EncounterObservationCard } from "./EncounterObservationCard"
import { MedicationRow, ProcedureRow, ReportRow, DiagnosisTag } from "./EncounterCards"
import { AnalyteTrendRow } from "./AnalyteTrendRow"
import { MedTrendRow } from "./MedTrendRow"
import { EncounterSection } from "./EncounterSection"
import { DocumentDetailDialog } from "@/features/clinical-summary/document-summary/components/DocumentDetailDialog"
import { useDocumentSummaryStrings, makeResolveSectionLabel } from "@/features/clinical-summary/document-summary/utils/strings"
import type { DocumentEntry } from "@/features/clinical-summary/document-summary/types"
import type { EncounterDetails } from "../hooks/useEncounterDetails"
import { useLanguage } from "@/src/application/providers/language.provider"

// Auto-collapse thresholds — counts above these flip the section to closed by
// default. Tuned for the typical inpatient stay (50+ labs, 10+ meds) while
// keeping short outpatient visits visible without an extra click.
const COLLAPSE_THRESHOLDS = {
  diagnoses: 6,
  tests: 20,
  medications: 10,
  procedures: Infinity, // procedures are rarely numerous; always show.
} as const

interface VisitDetailContentProps {
  details?: EncounterDetails
  documents?: DocumentEntry[]
  abnormalCount?: number
}

/** True when this visit has anything worth expanding. */
export function visitHasDetails(details?: EncounterDetails, documents?: DocumentEntry[]): boolean {
  const docs = documents ?? []
  return !!(docs.length > 0 || (details && (
    details.diagnoses.length > 0 ||
    details.medications.length > 0 ||
    details.tests.length > 0 ||
    details.reports.length > 0 ||
    details.procedures.length > 0
  )))
}

export function VisitDetailContent({ details, documents, abnormalCount = 0 }: VisitDetailContentProps) {
  const { t } = useLanguage()
  const docStrings = useDocumentSummaryStrings()
  const resolveDocSectionLabel = makeResolveSectionLabel(docStrings)
  const categoryLabel = (id: string): string =>
    (t.reports.cumulativeCategories as Record<string, string>)[id] || id
  const docs = documents ?? []

  if (!visitHasDetails(details, documents)) {
    return <div className="text-xs text-muted-foreground">{t.visitHistory.noDetailsExpanded}</div>
  }

  return (
    <div className="space-y-4">
      {/* Linked documents. Header says 「出院病摘」 only when a linked doc really
          is a discharge summary (LOINC 18842-5); otherwise the generic 「病摘」 so
          a TW-PAS 事前審查申請病摘 / IPS / outpatient note isn't mislabelled. The
          popout opens the full text in the shared DocumentDetailDialog. */}
      {docs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {docs.some((d) => d.isDischargeSummary) ? docStrings.dischargeBadge : docStrings.documentBadge}
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
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0 text-[0.625rem] font-medium text-red-700 normal-case">
                {(t.visitHistory as any).abnormal ?? 'Abnormal'} {abnormalCount}
              </span>
            ) : undefined
          }
        >
          <div className="space-y-3 mt-2">
            {details.testGroups.map((group, gi) => (
              <div key={group.categoryId ?? `other-${gi}`} className="space-y-1">
                <div className="px-0.5 text-[0.6875rem] font-medium text-muted-foreground/80">
                  {group.categoryId ? categoryLabel(group.categoryId) : categoryLabel('other')}
                </div>
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

      {details?.reports.length ? (
        <EncounterSection
          title={t.visitHistory.examReports}
          count={details.reports.length}
          collapseThreshold={COLLAPSE_THRESHOLDS.procedures}
        >
          <div className="grid gap-2 mt-2">
            {details.reports.map((report) => (
              <ReportRow key={report.id} report={report} />
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
          <div className="grid gap-1 mt-2">
            {details.isMultiDay && details.medSeries.length > 0 ? (
              details.medSeries.map((s) => <MedTrendRow key={s.id} series={s} />)
            ) : (
              details.medications.map((med) => <MedicationRow key={med.id} medication={med} />)
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
    </div>
  )
}
