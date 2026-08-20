// Cross-facility timeline v2 — two tiers in one card:
//   1. Milestones: anchor events (admissions / ER / care plans, coverage
//      guaranteed app-side) plus a few AI turning-point picks. One row may
//      cover several refs (merged episode / same-cause series → ×N badge).
//   2. Care threads: recurring outpatient care expanded app-side from AI
//      rules — counts, spans and the dot strip are arithmetic over real
//      encounters, never AI claims.
// Dates, day counts, organizations and navigation all come from the bundle;
// the AI only wrote labels/notes/insights and chose the grouping.
"use client"

import { useMemo, useState } from "react"
import { ArrowUpRight, ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  CareThreadStatus,
  EncounterClass,
  MedicalSummaryResult,
  SummaryCareThread,
  SummaryMilestoneEvent,
  TimelineMilestoneCategory,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"

const CATEGORY_STYLES: Record<TimelineMilestoneCategory, { pill: string; dot: string }> = {
  admission: {
    pill: "bg-indigo-100 text-indigo-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-indigo-500 dark:bg-muted-foreground",
  },
  emergency: {
    pill: "bg-red-100 text-red-700 dark:bg-clinical-abnormal/10 dark:text-clinical-abnormal",
    dot: "bg-red-500 dark:bg-clinical-abnormal",
  },
  careplan: {
    pill: "bg-cyan-100 text-cyan-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-cyan-500 dark:bg-muted-foreground",
  },
  exam: {
    pill: "bg-teal-100 text-teal-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-teal-500 dark:bg-muted-foreground",
  },
  diagnosis: {
    pill: "bg-violet-100 text-violet-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-violet-500 dark:bg-muted-foreground",
  },
  procedure: {
    pill: "bg-emerald-100 text-emerald-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-emerald-500 dark:bg-muted-foreground",
  },
  medication: {
    pill: "bg-blue-100 text-blue-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-blue-500 dark:bg-muted-foreground",
  },
  encounter: {
    pill: "bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-muted-foreground",
    dot: "bg-slate-400",
  },
  lab: {
    pill: "bg-teal-100 text-teal-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-teal-500 dark:bg-muted-foreground",
  },
  followup: {
    pill: "bg-cyan-100 text-cyan-700 dark:bg-secondary/70 dark:text-secondary-foreground/80",
    dot: "bg-cyan-500 dark:bg-muted-foreground",
  },
}

// Thread dot colors keyed by organization, assigned in first-appearance order.
// Mid-tone hues stay legible on both light and dark card backgrounds.
const ORG_PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#6366f1", "#84cc16", "#0ea5e9", "#d946ef", "#64748b",
]

// Default milestone density: recent events (18 months) bounded to a
// screen-friendly window; older history folds behind a counted toggle.
const MIN_VISIBLE = 5
const MAX_VISIBLE = 8
const RECENT_MONTHS = 18
const THREADS_VISIBLE = 5

const THREAD_STATUS_ORDER: Record<CareThreadStatus, number> = {
  active: 0,
  interrupted: 1,
  ended: 2,
}

const THREAD_STATUS_STYLES: Record<CareThreadStatus, string> = {
  active: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  interrupted: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ended: "border-border bg-muted/40 text-muted-foreground",
}

function stayDays(start: string, end?: string): number | null {
  if (!end || end === start) return null
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
  return Number.isFinite(days) && days > 1 ? days : null
}

function monthsBefore(isoDate: string, months: number): string {
  const d = new Date(isoDate)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

/** Very old cached results predate the v2 finalize — map their single-ref
 *  picks so this card renders them without regeneration. */
function legacyEvents(result: MedicalSummaryResult): SummaryMilestoneEvent[] {
  return result.timeline.map((event) => ({
    keys: [event.key],
    date: event.date,
    ...(event.endDate && event.endDate !== event.date ? { endDate: event.endDate } : {}),
    label: event.label,
    category: event.category === "encounter" && event.encounterClass === "inpatient"
      ? "admission" as const
      : event.category === "encounter" && event.encounterClass === "emergency"
        ? "emergency" as const
        : event.category,
    organizations: event.organization ? [event.organization] : [],
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    encounterClass: event.encounterClass,
    refCount: 1,
    ...(event.documentEvidence ? { documentEvidence: event.documentEvidence } : {}),
  }))
}

interface CrossFacilityTimelineProps {
  result: MedicalSummaryResult
  title: string
  milestoneCategoryLabel: (category: TimelineMilestoneCategory) => string
  encounterClassLabel: (encounterClass: EncounterClass) => string
  onNavigate?: (target: ResourceNavTarget) => void
  /** "{count}" toggle label for the folded earlier events. */
  earlierLabel: string
  collapseLabel: string
  droppedNote: string | null
  /** Precomposed deterministic stats line (or null when unavailable). */
  statsLine: string | null
  windowBoundaryLabel: string
  /** "{count}" note shown when the app appended coverage-fallback rows. */
  fallbackNote: string
  threadsTitle: string
  threadsSubtitle: string
  threadStatusLabel: (status: CareThreadStatus) => string
  /** "{count}" visit-count chip label. */
  threadVisitCountLabel: string
  /** "{count}" toggle label for folded threads. */
  threadsShowMoreLabel: string
  threadsShowLessLabel: string
}

export function CrossFacilityTimeline({
  result,
  title,
  milestoneCategoryLabel,
  encounterClassLabel,
  onNavigate,
  earlierLabel,
  collapseLabel,
  droppedNote,
  statsLine,
  windowBoundaryLabel,
  fallbackNote,
  threadsTitle,
  threadsSubtitle,
  threadStatusLabel,
  threadVisitCountLabel,
  threadsShowMoreLabel,
  threadsShowLessLabel,
}: CrossFacilityTimelineProps) {
  const [showAll, setShowAll] = useState(false)
  const [showAllThreads, setShowAllThreads] = useState(false)

  const events = useMemo<SummaryMilestoneEvent[]>(
    () => result.milestones ?? legacyEvents(result),
    [result],
  )
  const threads = useMemo<SummaryCareThread[]>(
    () => [...(result.careThreads ?? [])].sort(
      (a, b) => THREAD_STATUS_ORDER[a.status] - THREAD_STATUS_ORDER[b.status],
    ),
    [result],
  )
  const orgColors = useMemo(() => {
    const colors = new Map<string, string>()
    for (const thread of threads) {
      for (const { name } of thread.organizations) {
        if (!colors.has(name)) colors.set(name, ORG_PALETTE[colors.size % ORG_PALETTE.length])
      }
    }
    return colors
  }, [threads])

  if (events.length === 0 && threads.length === 0) return null

  // events are newest-first; default view = recent window, older tail folds.
  const recentCutoff = events[0] ? monthsBefore(events[0].date, RECENT_MONTHS) : ""
  const recentCount = events.filter((event) => event.date >= recentCutoff).length
  const defaultVisible = Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, recentCount))
  const earlierCount = Math.max(0, events.length - defaultVisible)
  const visible = showAll ? events : events.slice(0, defaultVisible)

  const stats = result.timelineStats
  // NHI keeps a much longer admission history than outpatient claim detail —
  // mark that boundary honestly so "no visits before 2023" is never implied.
  const boundaryDate = stats?.firstOutpatientDate && stats.start &&
    new Date(stats.firstOutpatientDate).getTime() - new Date(stats.start).getTime() > 365 * 86400000
    ? stats.firstOutpatientDate
    : null

  const fallbackCount = events.filter((event) => event.coverageFallback).length

  const visibleThreads = showAllThreads ? threads : threads.slice(0, THREADS_VISIBLE)
  const hiddenThreadCount = Math.max(0, threads.length - THREADS_VISIBLE)

  // Shared time axis for every thread strip so rhythms compare across rows.
  const stripStart = threads.length
    ? threads.map((thread) => thread.first).sort()[0]
    : ""
  const stripEnd = threads.length
    ? threads.map((thread) => thread.last).sort().at(-1)!
    : ""
  const stripSpan = Math.max(1, new Date(stripEnd).getTime() - new Date(stripStart).getTime())
  const stripPos = (date: string) =>
    Math.min(99, Math.max(0.5, ((new Date(date).getTime() - new Date(stripStart).getTime()) / stripSpan) * 100))
  const yearTicks: string[] = []
  if (threads.length) {
    for (let year = new Date(stripStart).getFullYear() + 1; year <= new Date(stripEnd).getFullYear(); year++) {
      yearTicks.push(`${year}-01-01`)
    }
  }

  // Pure per-row derivation (year headings, one-shot boundary marker) — no
  // mutable render-scope state, keeps React strict-render happy.
  const renderRows = visible.map((event, index) => {
    const prev = visible[index - 1]
    const year = event.date.slice(0, 4)
    const yearHeading = !prev || prev.date.slice(0, 4) !== year ? year : null
    // The boundary marker sits where outpatient claim detail begins — render
    // it once, before the first event older than that date.
    const showBoundary = Boolean(
      boundaryDate && event.date < boundaryDate && (!prev || prev.date >= boundaryDate),
    )
    return { event, yearHeading, showBoundary }
  })

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{title}</h3>
        {statsLine ? (
          <span className="text-[0.65rem] tabular-nums text-muted-foreground/70">{statsLine}</span>
        ) : null}
      </div>
      <div className="@container">
        <ul className="ml-1 space-y-0 border-l-2 border-border pl-3.5">
          {renderRows.map(({ event, yearHeading, showBoundary }) => {
            const style = CATEGORY_STYLES[event.category] ?? CATEGORY_STYLES.encounter
            const pillLabel = event.category === "encounter" && event.encounterClass
              ? encounterClassLabel(event.encounterClass)
              : milestoneCategoryLabel(event.category)
            const days = stayDays(event.date, event.endDate)
            const displayedDate = event.endDate && event.endDate !== event.date
              ? `${event.date}–${event.endDate.slice(5)}`
              : event.date
            const inner = (
              <div className="@min-[30rem]:flex @min-[30rem]:items-baseline @min-[30rem]:gap-2">
                <div className="flex flex-wrap items-center gap-1.5 @min-[30rem]:w-[17rem] @min-[30rem]:shrink-0">
                  <span className="text-[0.6875rem] font-bold tabular-nums text-foreground/80">{displayedDate}</span>
                  {days ? (
                    <span className="text-[0.625rem] font-semibold tabular-nums text-muted-foreground">{days}d</span>
                  ) : null}
                  <span className={cn("rounded px-1.5 py-px text-[0.65rem] font-semibold", style.pill)}>
                    {pillLabel}
                    {event.refCount > 1 ? `×${event.refCount}` : ""}
                  </span>
                  {event.organizations.slice(0, 2).map((org) => (
                    <span
                      key={org}
                      className="rounded border border-border bg-muted/40 px-1.5 py-px text-[0.625rem] text-muted-foreground"
                    >
                      {org}
                    </span>
                  ))}
                  {onNavigate ? (
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                  ) : null}
                </div>
                <div className="min-w-0 @min-[30rem]:flex-1">
                  <p className={cn(
                    "mt-0.5 text-[0.8125rem] leading-snug @min-[30rem]:mt-0",
                    event.coverageFallback ? "text-muted-foreground" : "text-foreground",
                  )}>
                    {event.label}
                  </p>
                  {event.note ? (
                    <p className="text-[0.7rem] leading-snug text-muted-foreground">{event.note}</p>
                  ) : null}
                </div>
              </div>
            )
            return (
              <li key={`${event.keys.join("+")}-${event.date}`} className="relative">
                {yearHeading ? (
                  <div className="pb-1 pt-1.5 text-[0.65rem] font-bold tracking-wider text-muted-foreground/50">
                    {yearHeading}
                  </div>
                ) : null}
                {showBoundary ? (
                  <div className="-ml-[18px] mb-2 mt-1 border-y border-dashed border-border py-1 pl-4 text-[0.65rem] text-muted-foreground/70">
                    {windowBoundaryLabel}
                  </div>
                ) : null}
                <div className="relative pb-3 @min-[30rem]:pb-2">
                  <span
                    className={cn(
                      "absolute -left-[19.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                      style.dot,
                      event.coverageFallback && "opacity-60",
                    )}
                  />
                  {onNavigate ? (
                    // The whole event row links to its primary raw resource in
                    // the left panel — same second-evidence-layer pipeline.
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          resourceType: event.resourceType,
                          resourceId: event.resourceId,
                          display: event.label,
                          date: event.date,
                          evidenceQuote: event.documentEvidence?.find(
                            (evidence) => event.keys.includes(evidence.source),
                          )?.quote ?? event.documentEvidence?.[0]?.quote,
                        })
                      }
                      className="group -mx-1 -my-0.5 min-h-[44px] w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 lg:min-h-8"
                    >
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {earlierCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground lg:min-h-8"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? collapseLabel : earlierLabel.replace("{count}", String(earlierCount))}
        </button>
      ) : null}

      {threads.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
            <h4 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{threadsTitle}</h4>
            <span className="text-[0.65rem] text-muted-foreground/60">{threadsSubtitle}</span>
          </div>
          <ul>
            {visibleThreads.map((thread) => {
              const row = (
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn(
                      "text-[0.8125rem] font-medium leading-snug",
                      thread.status === "ended" ? "text-muted-foreground" : "text-foreground",
                    )}>
                      {thread.label}
                    </span>
                    <span className="text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
                      {threadVisitCountLabel.replace("{count}", String(thread.count))}
                    </span>
                    <span className={cn(
                      "rounded border px-1.5 py-px text-[0.625rem]",
                      THREAD_STATUS_STYLES[thread.status],
                    )}>
                      {threadStatusLabel(thread.status)}
                    </span>
                    <span className="ml-auto text-[0.65rem] tabular-nums text-muted-foreground/60">
                      {thread.first.slice(0, 7)} – {thread.last.slice(0, 7)}
                    </span>
                  </div>
                  <div className="relative my-1 h-3.5">
                    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                    {yearTicks.map((tick) => (
                      <span
                        key={tick}
                        className="absolute bottom-0 top-0 w-px bg-border/70"
                        style={{ left: `${stripPos(tick)}%` }}
                      />
                    ))}
                    {thread.visits.map((visit, index) => (
                      <span
                        key={`${visit.resourceId}-${index}`}
                        className={cn(
                          "absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                          thread.status === "ended" && "opacity-50",
                        )}
                        style={{
                          left: `${stripPos(visit.date)}%`,
                          backgroundColor: visit.organization
                            ? orgColors.get(visit.organization) ?? "#94a3b8"
                            : "#94a3b8",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {thread.organizations.map(({ name, count }) => (
                      <span key={name} className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: orgColors.get(name) ?? "#94a3b8" }}
                        />
                        {name} {count}
                      </span>
                    ))}
                    {thread.insight ? (
                      <span className="ml-auto min-w-0 text-[0.7rem] leading-snug text-muted-foreground">
                        {thread.insight}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
              const latestVisit = thread.visits[thread.visits.length - 1]
              return (
                <li key={`${thread.label}-${thread.codePrefixes.join("/")}`} className="border-t border-border/60 py-1.5 first:border-t-0">
                  {onNavigate && latestVisit ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          resourceType: "Encounter",
                          resourceId: latestVisit.resourceId,
                          display: thread.label,
                          date: latestVisit.date,
                        })
                      }
                      className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
                    >
                      {row}
                    </button>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
          {hiddenThreadCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllThreads((v) => !v)}
              className="mt-1 flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground lg:min-h-8"
              aria-expanded={showAllThreads}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllThreads && "rotate-180")} />
              {showAllThreads ? threadsShowLessLabel : threadsShowMoreLabel.replace("{count}", String(hiddenThreadCount))}
            </button>
          ) : null}
        </div>
      ) : null}

      {fallbackCount > 0 ? (
        <p className="mt-1.5 text-[0.65rem] text-muted-foreground/70">
          {fallbackNote.replace("{count}", String(fallbackCount))}
        </p>
      ) : null}
      {droppedNote ? (
        <p className="mt-1.5 text-[0.65rem] text-muted-foreground/70">{droppedNote}</p>
      ) : null}
    </div>
  )
}
