"use client"

import { useState } from "react"
import { PanelRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { VisitDetailContent, visitHasDetails } from "./VisitDetailContent"
import { useDocumentSummaryStrings } from "@/features/clinical-summary/document-summary/utils/strings"
import type { DocumentEntry } from "@/features/clinical-summary/document-summary/types"
import type { VisitRecord } from "../hooks/useVisitHistory"
import type { EncounterDetails } from "../hooks/useEncounterDetails"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightDetail } from "@/src/application/providers/right-detail.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import { formatDate as formatDateUtil } from "@/src/shared/utils/date.utils"
import { cn } from "@/src/shared/utils/cn.utils"

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
  return <Badge variant="outline" className={cn("h-5 px-1.5 py-0 text-[0.6875rem]", className || undefined)}>{label}</Badge>
}

export function VisitItem({ visit, details, documents, abnormalCount = 0, isExpanded, onToggle }: VisitItemProps) {
  const { t, locale } = useLanguage()
  const docStrings = useDocumentSummaryStrings()
  const { detail: rightDetail, toggleDetail } = useRightDetail()
  const reasonCodes = visit.icdCodes
  const hasIcdCodes = reasonCodes.length > 0 && /^[A-Z]\d/.test(reasonCodes[0].code)
  const hasSecondaryIcds = hasIcdCodes && reasonCodes.length > 1
  const [icdExpanded, setIcdExpanded] = useState(false)
  const docs = documents ?? []
  const hasDetails = visitHasDetails(details, documents)
  const isRightActive = rightDetail?.sourceId === visit.id

  // Date label: a "住院日 ~ 出院日" range for inpatient stays that carry a
  // discharge date (Encounter.period.end on a different day); otherwise the
  // single visit date. Single-day visits and inpatient records with no
  // discharge data keep showing just the one date.
  const startLabel = formatDateUtil(visit.date, locale)
  const showRange = !!visit.endDate && !!visit.date &&
    visit.endDate.slice(0, 10) !== visit.date.slice(0, 10)
  const dateLabel = showRange
    ? `${startLabel} ~ ${formatDateUtil(visit.endDate as string, locale)}`
    : startLabel

  // Open this visit's detail in the right pane (向右展開). Reuses the very same
  // VisitDetailContent that renders inline.
  const openInRightPane = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleDetail({
      sourceId: visit.id,
      title: (
        <span className="flex items-center gap-1.5">
          {getTypeBadge(visit.type, t.visitHistory.badges)}
          <span>{dateLabel}</span>
          {visit.location && <span className="text-xs font-normal text-muted-foreground">· {visit.location}</span>}
        </span>
      ),
      node: <VisitDetailContent details={details} documents={documents} abnormalCount={abnormalCount} />,
    })
  }

  // Resource-navigation anchor: a cited Encounter in the Medical Summary tab
  // scroll-flashes this card.
  const anchorRef = useResourceAnchor('Encounter', visit.id)

  return (
    <div
      ref={anchorRef}
      className={cn(
        "rounded-lg border transition-colors",
        // 向右展開 active: tint the whole row so it's clear which visit the
        // right pane is showing.
        isRightActive && "border-primary/40 bg-primary/5",
      )}
    >
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
        className="w-full rounded-lg px-3 py-1 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer"
      >
        {/* Header: when/where on the left, the at-a-glance count pills pushed
            to the right (justify-between), then the expand chevron. A collapsed
            visit stays ~2 short rows. The pills live in their own right cluster
            that wraps INTERNALLY (max-w cap) when they're many/wide, so the
            left date never gets orphaned onto its own line. */}
        <div className="flex items-center justify-between gap-1.5 leading-5">
          <div className="flex flex-1 items-center gap-x-1.5 overflow-hidden min-w-0">
            {getTypeBadge(visit.type, t.visitHistory.badges)}
            {visit.location && (
              <span
                className="inline-flex h-5 max-w-[9rem] shrink-0 items-center rounded-md border border-border bg-muted px-1.5 py-0 text-[0.6875rem] text-muted-foreground"
                title={visit.location}
              >
                <span className="truncate">{visit.location}</span>
              </span>
            )}
            <span className="min-w-0 truncate text-[0.9375rem] font-medium leading-5">{dateLabel}</span>
            {visit.status === "in-progress" && (
              <Badge variant="outline" className="h-5 px-1.5 py-0 text-[0.6875rem] border-green-500 text-green-700">
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
                  <span className="inline-flex h-5 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[0.625rem] text-violet-700">
                    {t.visitHistory.diagnoses} {details.diagnoses.length}
                  </span>
                )}
                {details.tests.length > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0 text-[0.625rem] text-blue-700">
                    {t.visitHistory.tests} {details.tests.length}
                  </span>
                )}
                {abnormalCount > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0 text-[0.625rem] font-medium text-red-700">
                    {(t.visitHistory as any).abnormal ?? 'Abnormal'} {abnormalCount}
                  </span>
                )}
                {details.medications.length > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full border border-green-200 bg-green-50 px-1.5 py-0 text-[0.625rem] text-green-700">
                    {t.visitHistory.medications} {details.medications.length}
                  </span>
                )}
                {details.reports.length > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0 text-[0.625rem] text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300">
                    {t.visitHistory.examReports} {details.reports.length}
                  </span>
                )}
                {details.procedures.length > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0 text-[0.625rem] text-orange-700">
                    {t.visitHistory.procedures} {details.procedures.length}
                  </span>
                )}
              </>
            )}
            {/* Linked-document indicator — at-a-glance marker that this visit
                has a document to open in the expanded view. Only label it
                「出院病摘」 when a linked doc is actually a discharge summary
                (LOINC 18842-5); otherwise a generic 「病摘」 so a TW-PAS
                事前審查申請病摘 / IPS / outpatient note isn't mislabelled. */}
            {docs.length > 0 && (() => {
              const hasDischarge = docs.some((d) => d.isDischargeSummary)
              return (
                <span
                  title={hasDischarge ? docStrings.dischargeBadgeTooltip : docStrings.documentBadgeTooltip}
                  className="inline-flex h-5 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[0.625rem] text-emerald-700"
                >
                  {hasDischarge ? docStrings.dischargeBadge : docStrings.documentBadge}
                </span>
              )
            })()}
            {/* 向右展開 — show this visit's detail in the right pane (desktop
                only; no side-by-side room on phones). Sits beside the ▼/▲
                (向下展開) so the user picks per row. */}
            {hasDetails && (
              <button
                type="button"
                onClick={openInRightPane}
                onMouseDown={(e) => e.stopPropagation()}
                title={(t.visitHistory as any).openRight ?? '在右側展開'}
                aria-label={(t.visitHistory as any).openRight ?? '在右側展開'}
                className={cn(
                  "hidden h-5 w-5 md:inline-flex items-center justify-center rounded-md border p-0 transition-colors",
                  isRightActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <PanelRight className="h-3 w-3" />
              </button>
            )}
            <span
              className="text-xs text-muted-foreground leading-5"
              title={hasDetails ? (isExpanded ? t.visitHistory.hideDetails : t.visitHistory.viewDetails) : t.visitHistory.noDetails}
            >
              {hasDetails ? (isExpanded ? "▲" : "▼") : ""}
            </span>
          </div>
        </div>

        {(visit.department || visit.physician || visit.reason || visit.diagnosis) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-sm leading-5">
            {visit.department && (
              <span className="max-w-[8rem] shrink-0 truncate text-xs leading-5 text-muted-foreground" title={visit.department}>
                {visit.department}
              </span>
            )}
            {visit.physician && (
              <span className="max-w-[9rem] shrink-0 truncate text-xs leading-5 text-muted-foreground" title={`${t.visitHistory.physician} ${visit.physician}`}>
                {t.visitHistory.physician} {visit.physician}
              </span>
            )}
            {visit.reason && (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span
                  className="shrink-0 font-medium text-muted-foreground"
                  title={(t.visitHistory as any).icdCodesTooltip}
                >
                  {(t.visitHistory as any).recordedIcdCodes ?? t.visitHistory.reason}:{' '}
                </span>
                {hasIcdCodes ? (
                  <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden align-middle">
                    {/* Default: primary only. Click "+N" to reveal secondaries inline. */}
                    {(icdExpanded ? reasonCodes : reasonCodes.slice(0, 1)).map((rc, i) => (
                      <span
                        key={`${rc.code}-${i}`}
                        title={(t.visitHistory as any).icdCodesTooltip}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="inline-flex h-5 min-w-0 max-w-[16rem] items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0 text-xs text-amber-800 select-text cursor-text"
                      >
                        <span className="font-mono font-medium">{rc.code}</span>
                        {rc.description && (
                          <span className="min-w-0 truncate text-amber-700/80">
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
                        className="inline-flex h-5 shrink-0 items-center rounded-md border border-amber-200 bg-amber-50/60 px-1.5 py-0 text-[0.6875rem] text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        {icdExpanded ? '−' : `+${reasonCodes.length - 1}`}
                      </button>
                    )}
                  </span>
                ) : (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="min-w-0 truncate select-text cursor-text"
                  >
                    {visit.reason}
                  </span>
                )}
              </span>
            )}
            {!visit.reason && visit.diagnosis && (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="shrink-0 font-medium text-muted-foreground">{t.visitHistory.diagnosis}: </span>
                <span className="min-w-0 truncate">{visit.diagnosis}</span>
              </span>
            )}
          </div>
        )}

      </div>

      {isExpanded && (
        <div className="border-t bg-muted/30 px-3 py-3 text-sm">
          <VisitDetailContent details={details} documents={documents} abnormalCount={abnormalCount} />
        </div>
      )}
    </div>
  )
}
