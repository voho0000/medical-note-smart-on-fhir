// 最近 90 天 — date-labelled rows. Dates, hospitals and 住院/急診/門診 come from
// the bundle (never the AI); the model only chose which events matter and wrote
// the one-line label. Events older than the window survive only as admissions
// and procedures, and the count of everything dropped is surfaced, never hidden.
"use client"

import { useState } from "react"
import { ArrowUpRight, ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  EncounterClass,
  MedicalSummaryResult,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { useLanguage } from "@/src/application/providers/language.provider"
import { formatOrganizationDisplay } from "@/src/shared/utils/organization-display"

// Encounter subtype (from the bundle's Encounter.class) is the one badge here:
// an admission and a routine visit must not read the same at a glance.
const ENCOUNTER_CLASS_BADGE: Record<EncounterClass, string> = {
  inpatient: "bg-indigo-100 text-indigo-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
  emergency: "bg-red-100 text-red-700 dark:bg-clinical-abnormal/10 dark:text-clinical-abnormal",
  outpatient: "bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-muted-foreground",
}

const INITIAL_VISIBLE = 6

const isDocumentEvent = (resourceType: string) =>
  resourceType === "Composition" || resourceType === "DocumentReference"

interface RecentEventsCardProps {
  result: MedicalSummaryResult
  title: string
  subtitle: string
  encounterClassLabel: (encounterClass: EncounterClass) => string
  earlierLabel: string
  collapseLabel: string
  droppedNote: string | null
  onNavigate?: (target: ResourceNavTarget) => void
}

export function RecentEventsCard({
  result,
  title,
  subtitle,
  encounterClassLabel,
  earlierLabel,
  collapseLabel,
  droppedNote,
  onNavigate,
}: RecentEventsCardProps) {
  const { locale } = useLanguage()
  const [showAll, setShowAll] = useState(false)
  const events = result.recent ?? []
  if (events.length === 0) return null

  const earlierCount = Math.max(0, events.length - INITIAL_VISIBLE)
  const visible = showAll ? events : events.slice(0, INITIAL_VISIBLE)

  return (
    <section
      className="rounded-lg border border-border bg-card px-3 py-2.5"
      aria-labelledby="medical-summary-recent-title"
    >
      <h3
        id="medical-summary-recent-title"
        className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground"
      >
        {title}
        <span className="ml-1 font-normal text-muted-foreground/80">{subtitle}</span>
      </h3>
      {visible.some((event) => isDocumentEvent(event.resourceType)) ? (
        // A discharge summary is dated by its source record, which can differ
        // from when the surgery or diagnosis inside it happened.
        <p className="mb-1.5 text-xs text-muted-foreground">
          {locale === "zh-TW"
            ? "文件列依來源日期排序，不一定是事件發生日期；請開啟原文核對事件時間。"
            : "Document rows use the source date, which may differ from the event date. Check event timing in the original document."}
        </p>
      ) : null}

      <ul>
        {visible.map((event) => {
          const encounterClass = event.category === "encounter" ? event.encounterClass : undefined
          const displayedDate = event.endDate && event.endDate !== event.date
            ? `${event.date}–${event.endDate}`
            : event.date
          const organizationLabel = event.organization
            ? formatOrganizationDisplay(event.organization, locale)
            : ""
          const isDocument = isDocumentEvent(event.resourceType)
          const evidence = event.documentEvidence?.find((item) => item.source === event.key)
          // The app checks the model's quote against the document text; anything
          // short of an exact (or whitespace-only) match is flagged for review.
          const documentNeedsReview = isDocument &&
            evidence?.verification !== "exact" && evidence?.verification !== "whitespace-restored"
          const inner = (
            <div className="grid grid-cols-1 gap-x-2 @min-[24rem]:grid-cols-[5.5rem_minmax(0,1fr)] @min-[24rem]:items-baseline">
              <span className="text-[0.6875rem] font-bold tabular-nums text-foreground/80">
                {isDocument ? (
                  <span className="font-normal">{locale === "zh-TW" ? "文件來源日期：" : "Document source date: "}</span>
                ) : null}
                {displayedDate}
              </span>
              <span className="min-w-0 text-[0.8125rem] leading-snug text-foreground">
                {event.label}
                {organizationLabel ? (
                  <span className="ml-1 whitespace-nowrap rounded border border-border bg-muted/40 px-1.5 py-px text-[0.625rem] text-muted-foreground">
                    {organizationLabel}
                  </span>
                ) : null}
                {encounterClass ? (
                  <span
                    className={cn(
                      "ml-1 whitespace-nowrap rounded px-1.5 py-px text-[0.625rem] font-semibold",
                      ENCOUNTER_CLASS_BADGE[encounterClass],
                    )}
                  >
                    {encounterClassLabel(encounterClass)}
                  </span>
                ) : null}
                {documentNeedsReview ? (
                  <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                    {locale === "zh-TW" ? "原文引句待核對，請點開來源確認。" : "Excerpt needs review. Open the source to check."}
                  </span>
                ) : null}
                {onNavigate ? (
                  <ArrowUpRight className="ml-1 inline h-3 w-3 align-[-0.1em] text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" />
                ) : null}
              </span>
            </div>
          )
          return (
            <li
              key={`${event.key}-${event.date}-${event.category}-${event.label}`}
              className="@container border-b border-border py-1 last:border-b-0"
            >
              {onNavigate ? (
                // The whole row links to its raw resource in the left panel —
                // same second-evidence-layer pipeline as SourceSup.
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      resourceType: event.resourceType,
                      resourceId: event.resourceId,
                      display: event.label,
                      date: event.date,
                      evidenceQuote: evidence?.quote,
                    })
                  }
                  className="group -mx-1 -my-0.5 min-h-[44px] w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 lg:min-h-8"
                >
                  {inner}
                </button>
              ) : (
                inner
              )}
            </li>
          )
        })}
      </ul>

      {earlierCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1 flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground lg:min-h-8"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? collapseLabel : earlierLabel.replace("{count}", String(earlierCount))}
        </button>
      ) : null}
      {droppedNote ? (
        <p className="mt-1 text-[0.65rem] text-muted-foreground/70">{droppedNote}</p>
      ) : null}
    </section>
  )
}
