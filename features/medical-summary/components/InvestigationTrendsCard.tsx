// Disease-oriented test overview: the AI selects only the lab / pathology /
// imaging topics that matter for this patient's active problems, while every
// row keeps navigable citations to the original FHIR DiagnosticReports.
"use client"

import { useState } from "react"
import {
  Activity,
  ChevronDown,
  FlaskConical,
  Images,
  Microscope,
  Minus,
  Shuffle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  InvestigationDirection,
  InvestigationKind,
  MedicalSummaryResult,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

const DIRECTION_STYLE: Record<
  InvestigationDirection,
  { box: string; badge: string; icon: typeof TrendingUp }
> = {
  improving: {
    box: "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: TrendingUp,
  },
  stable: {
    box: "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    icon: Minus,
  },
  worsening: {
    box: "border-l-red-500 bg-red-50/60 dark:bg-red-950/20",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    icon: TrendingDown,
  },
  fluctuating: {
    box: "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    icon: Shuffle,
  },
  single: {
    box: "border-l-slate-400 bg-slate-50/70 dark:bg-slate-900/40",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
    icon: Activity,
  },
  unknown: {
    box: "border-l-slate-300 bg-slate-50/50 dark:bg-slate-900/30",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
    icon: Activity,
  },
}

const KIND_ICON: Record<InvestigationKind, typeof FlaskConical> = {
  lab: FlaskConical,
  imaging: Images,
  pathology: Microscope,
  other: Activity,
}

interface InvestigationTrendsCardProps {
  result: MedicalSummaryResult
  title: string
  subtitle: string
  kindLabel: (kind: InvestigationKind) => string
  directionLabel: (direction: InvestigationDirection) => string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  showMoreLabel: string
  showLessLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

const INITIAL_VISIBLE = 3

export function InvestigationTrendsCard({
  result,
  title,
  subtitle,
  kindLabel,
  directionLabel,
  typeLabel,
  unverifiedLabel,
  showMoreLabel,
  showLessLabel,
  onNavigate,
}: InvestigationTrendsCardProps) {
  const [showAll, setShowAll] = useState(false)
  // Tolerate encrypted caches from before this card was introduced.
  const investigations = result.investigations ?? []
  if (investigations.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))
  const hiddenCount = Math.max(0, investigations.length - INITIAL_VISIBLE)
  const visible = showAll ? investigations : investigations.slice(0, INITIAL_VISIBLE)

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" aria-labelledby="investigation-trends-title">
      <div className="mb-2">
        <h3 id="investigation-trends-title" className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/75">{subtitle}</p>
      </div>

      <div className="space-y-1.5">
        {visible.map((item, index) => {
          const style = DIRECTION_STYLE[item.direction]
          const DirectionIcon = style.icon
          const KindIcon = KIND_ICON[item.kind]
          const sources = item.sourceKeys
            .map((key) => byKey.get(key))
            .filter((source): source is ResolvedSourceRef => source !== undefined)

          return (
            <article key={`${item.label}-${index}`} className={cn("rounded-md border-l-[3px] px-2.5 py-2", style.box)}>
              <div className="flex flex-wrap items-start gap-1.5">
                <KindIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">
                    {item.label}
                    <SourceSup
                      sources={sources}
                      typeLabel={typeLabel}
                      unverifiedLabel={unverifiedLabel}
                      onNavigate={onNavigate}
                    />
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] font-medium leading-snug tabular-nums text-foreground/90">
                    {item.trend}
                  </p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[0.625rem] font-semibold", style.badge)}>
                  <DirectionIcon className="h-3 w-3" aria-hidden="true" />
                  {directionLabel(item.direction)}
                </span>
              </div>
              <div className="mt-1 flex items-start gap-1.5 pl-5 text-[0.65rem] leading-snug text-muted-foreground">
                <span className="shrink-0 rounded bg-background/70 px-1.5 py-px font-medium">
                  {kindLabel(item.kind)}
                </span>
                <p className="min-w-0 pt-px">{item.interpretation}</p>
              </div>
            </article>
          )
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 flex items-center gap-1 text-[0.6875rem] font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? showLessLabel : showMoreLabel.replace("{count}", String(hiddenCount))}
        </button>
      ) : null}
    </section>
  )
}
