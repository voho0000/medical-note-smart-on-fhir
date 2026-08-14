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
  Loader2,
  Microscope,
  Minus,
  Shuffle,
  Table2,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  InvestigationDirection,
  InvestigationKind,
  MedicalSummaryResult,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { limitInvestigationTrendPoints } from "@/src/shared/utils/investigation-trend.utils"
import type { InvestigationCumulativeTarget } from "../utils/investigation-cumulative-target"
import { SourceSup } from "./SourceSup"
import { resolveClaimSources } from "../utils/resolve-claim-sources"

const DIRECTION_STYLE: Record<
  InvestigationDirection,
  { box: string; badge: string; icon: typeof TrendingUp }
> = {
  improving: {
    box: "bg-emerald-50/60 dark:bg-emerald-500/[0.07]",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    icon: TrendingUp,
  },
  stable: {
    box: "bg-blue-50/50 dark:bg-blue-500/[0.07]",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    icon: Minus,
  },
  worsening: {
    box: "bg-red-50/60 dark:bg-rose-500/[0.07]",
    badge: "bg-red-100 text-red-700 dark:bg-rose-500/10 dark:text-rose-300",
    icon: TrendingDown,
  },
  fluctuating: {
    box: "bg-amber-50/60 dark:bg-amber-500/[0.07]",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    icon: Shuffle,
  },
  single: {
    box: "bg-slate-50/70 dark:bg-muted/35",
    badge: "bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-muted-foreground",
    icon: Activity,
  },
  unknown: {
    box: "bg-slate-50/50 dark:bg-muted/25",
    badge: "bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-muted-foreground",
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
  openCumulativeLabel: string
  openingCumulativeLabel: string
  cumulativeTargets?: Array<InvestigationCumulativeTarget | null>
  openingCumulativeTarget?: InvestigationCumulativeTarget | null
  onOpenCumulative?: (target: InvestigationCumulativeTarget) => void
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
  openCumulativeLabel,
  openingCumulativeLabel,
  cumulativeTargets,
  openingCumulativeTarget,
  onOpenCumulative,
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
          const cumulativeTarget = cumulativeTargets?.[index] ?? null
          const isOpeningCumulative = Boolean(
            cumulativeTarget
              && openingCumulativeTarget
              && cumulativeTarget.categoryId === openingCumulativeTarget.categoryId
              && cumulativeTarget.resourceType === openingCumulativeTarget.resourceType
              && cumulativeTarget.resourceId === openingCumulativeTarget.resourceId,
          )
          const sources = resolveClaimSources(
            item.sourceKeys,
            byKey,
            item.documentEvidence,
          )

          return (
            <article key={`${item.label}-${index}`} className={cn("rounded-md px-2.5 py-2", style.box)}>
              <div className="flex flex-wrap items-start gap-1.5">
                <KindIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-primary/80" />
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
                    {limitInvestigationTrendPoints(item.trend)}
                  </p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[0.625rem] font-semibold", style.badge)}>
                  <DirectionIcon className="h-3 w-3" aria-hidden="true" />
                  {directionLabel(item.direction)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-start gap-1.5 pl-5 text-[0.65rem] leading-snug text-muted-foreground">
                <span className="shrink-0 rounded bg-background/70 px-1.5 py-px font-medium">
                  {kindLabel(item.kind)}
                </span>
                <p className="min-w-[12rem] flex-1 pt-px">{item.interpretation}</p>
                {cumulativeTarget && onOpenCumulative ? (
                  <button
                    type="button"
                    onClick={() => onOpenCumulative(cumulativeTarget)}
                    disabled={isOpeningCumulative}
                    aria-busy={isOpeningCumulative}
                    aria-label={`${isOpeningCumulative ? openingCumulativeLabel : openCumulativeLabel}: ${item.label}`}
                    title={`${openCumulativeLabel}: ${item.label}`}
                    className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-medium text-primary transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-80 lg:min-h-8"
                  >
                    {isOpeningCumulative ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Table2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    {isOpeningCumulative ? openingCumulativeLabel : openCumulativeLabel}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 flex min-h-[44px] items-center gap-1 text-[0.6875rem] font-medium text-primary hover:text-primary/80 lg:min-h-8"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? showLessLabel : showMoreLabel.replace("{count}", String(hiddenCount))}
        </button>
      ) : null}
    </section>
  )
}
