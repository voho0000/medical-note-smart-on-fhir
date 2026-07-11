// Cross-facility timeline — pure CSS vertical list, zero interaction. Dates
// and facility tags come from the bundle skeleton (never the AI); the AI only
// curated which events matter and wrote the one-line labels. Picks that failed
// to resolve against the bundle were dropped upstream — the count is surfaced
// here so the truncation is never silent.
"use client"

import { useState } from "react"
import { ArrowUpRight, ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  EncounterClass,
  MedicalSummaryResult,
  TimelineCategory,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"

const CATEGORY_STYLES: Record<TimelineCategory, { pill: string; dot: string }> = {
  diagnosis: {
    pill: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  procedure: {
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  medication: {
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  encounter: {
    pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  lab: {
    pill: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  followup: {
    pill: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    dot: "bg-cyan-500",
  },
}

// Encounter subtype (from the bundle's Encounter.class) overrides the generic
// grey "encounter" style: admissions and ER visits should read at a glance.
const ENCOUNTER_CLASS_STYLES: Record<EncounterClass, { pill: string; dot: string }> = {
  inpatient: {
    pill: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  emergency: {
    pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    dot: "bg-red-500",
  },
  outpatient: {
    pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
    dot: "bg-slate-400",
  },
}

// Cross-hospital bundles span years; the recent events carry the clinical
// weight, so cap the initial view and fold the older tail behind a counted
// toggle (chronological order is preserved — earlier events slot in above).
const INITIAL_VISIBLE = 10

interface CrossFacilityTimelineProps {
  result: MedicalSummaryResult
  title: string
  categoryLabel: (category: TimelineCategory) => string
  encounterClassLabel: (encounterClass: EncounterClass) => string
  onNavigate?: (target: ResourceNavTarget) => void
  /** "{count}" toggle label for the folded earlier events. */
  earlierLabel: string
  collapseLabel: string
  droppedNote: string | null
}

export function CrossFacilityTimeline({
  result,
  title,
  categoryLabel,
  encounterClassLabel,
  onNavigate,
  earlierLabel,
  collapseLabel,
  droppedNote,
}: CrossFacilityTimelineProps) {
  const [showAll, setShowAll] = useState(false)
  if (result.timeline.length === 0) return null

  // timeline is newest-first; the first INITIAL_VISIBLE are the most recent,
  // older events fold below via the toggle at the bottom.
  const earlierCount = Math.max(0, result.timeline.length - INITIAL_VISIBLE)
  const visible = showAll ? result.timeline : result.timeline.slice(0, INITIAL_VISIBLE)

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {/* Events cap then scroll (title stays fixed); the timeline
          dots sit at x≥0 so the scroll box never clips them. @container: when
          the card spans the full panel width (timeline sits BELOW the 2-col
          split), each event compacts to a single line — date · tag · hospital
          · label — instead of stacking the label and leaving the right half
          empty. Narrow cards keep the two-line stack. */}
      <div className="@container max-h-[26rem] overflow-y-auto scrollbar-thin-persistent">
        <ul className="ml-1 space-y-0 border-l-2 border-border pl-3.5">
          {visible.map((event) => {
            const encClass = event.category === "encounter" ? event.encounterClass : undefined
            const style = encClass ? ENCOUNTER_CLASS_STYLES[encClass] : CATEGORY_STYLES[event.category]
            const pillLabel = encClass ? encounterClassLabel(encClass) : categoryLabel(event.category)
            const inner = (
              <div className="@min-[30rem]:flex @min-[30rem]:items-baseline @min-[30rem]:gap-2">
                <div className="flex flex-wrap items-center gap-1.5 @min-[30rem]:w-[16rem] @min-[30rem]:shrink-0">
                  <span className="text-[0.6875rem] font-bold tabular-nums text-foreground/80">{event.date}</span>
                  <span className={cn("rounded px-1.5 py-px text-[0.65rem] font-semibold", style.pill)}>
                    {pillLabel}
                  </span>
                  {event.organization ? (
                    <span className="rounded border border-border bg-muted/40 px-1.5 py-px text-[0.625rem] text-muted-foreground">
                      {event.organization}
                    </span>
                  ) : null}
                  {onNavigate ? (
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                  ) : null}
                </div>
                <p className="mt-0.5 min-w-0 text-[0.8125rem] leading-snug text-foreground @min-[30rem]:mt-0 @min-[30rem]:flex-1">
                  {event.label}
                </p>
              </div>
            )
            return (
              <li key={`${event.key}-${event.date}`} className="relative pb-3 last:pb-0 @min-[30rem]:pb-2">
                <span
                  className={cn(
                    "absolute -left-[19.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                    style.dot,
                  )}
                />
                {onNavigate ? (
                  // The whole event row links to its raw resource in the left
                  // panel — same second-evidence-layer pipeline as SourceSup.
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate({
                        resourceType: event.resourceType,
                        resourceId: event.resourceId,
                        display: event.label,
                        date: event.date,
                      })
                    }
                    className="group -mx-1 -my-0.5 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
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
      </div>
      {earlierCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? collapseLabel : earlierLabel.replace("{count}", String(earlierCount))}
        </button>
      ) : null}
      {droppedNote ? (
        <p className="mt-1.5 text-[0.65rem] text-muted-foreground/70">{droppedNote}</p>
      ) : null}
    </div>
  )
}
