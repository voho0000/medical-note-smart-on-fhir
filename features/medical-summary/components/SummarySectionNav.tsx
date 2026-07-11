// Section jump-bar under the narrative card. Two jobs: (1) the COUNTS are the
// value — "3 high safety alerts" is arguably the page's most important number,
// visible without scrolling; (2) on a long page (many alerts / a long
// timeline) it lets the reader jump straight to a section. Zero-click reading
// is unaffected — this is an optional accelerator, not a gate.
"use client"

import { ShieldAlert, ClipboardCheck, Clock, ListChecks, ChartNoAxesCombined } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type { SafetyAlertCounts } from "@/src/application/hooks/safety-alerts/use-safety-alerts.hook"

export type SummarySection = "problems" | "investigations" | "safety" | "decisions" | "timeline"

interface SummarySectionNavProps {
  safety: SafetyAlertCounts | null
  problems: number
  investigations: number
  decisions: number
  timeline: number
  onJump: (section: SummarySection) => void
  labels: {
    safety: string
    problems: string
    investigations: string
    decisions: string
    timeline: string
    high: string
    medium: string
    low: string
  }
}

const chipBase =
  "flex min-h-[24px] items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:border-teal-300 hover:text-foreground dark:hover:border-teal-500/40"

export function SummarySectionNav({ safety, problems, investigations, decisions, timeline, onJump, labels }: SummarySectionNavProps) {
  // Nothing to navigate to → no bar (keeps a sparse summary clean).
  const hasSafety = safety && safety.total > 0
  if (!hasSafety && problems === 0 && investigations === 0 && decisions === 0 && timeline === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {investigations > 0 ? (
        <button type="button" onClick={() => onJump("investigations")} className={chipBase}>
          <ChartNoAxesCombined className="h-3 w-3 text-teal-500" />
          {labels.investigations}
          <span className="font-semibold tabular-nums text-foreground">{investigations}</span>
        </button>
      ) : null}

      {problems > 0 ? (
        <button type="button" onClick={() => onJump("problems")} className={chipBase}>
          <ListChecks className="h-3 w-3 text-violet-500" />
          {labels.problems}
          <span className="font-semibold tabular-nums text-foreground">{problems}</span>
        </button>
      ) : null}

      {hasSafety ? (
        <button type="button" onClick={() => onJump("safety")} className={chipBase}>
          <ShieldAlert className="h-3 w-3 text-blue-500" />
          {labels.safety}
          <span className="flex items-center gap-1 tabular-nums font-semibold">
            {safety!.high > 0 ? (
              <span className="text-red-600 dark:text-red-400" title={labels.high}>{safety!.high}</span>
            ) : null}
            {safety!.medium > 0 ? (
              <>
                {safety!.high > 0 ? <span className="text-muted-foreground/40">·</span> : null}
                <span className="text-amber-600 dark:text-amber-400" title={labels.medium}>{safety!.medium}</span>
              </>
            ) : null}
            {safety!.low > 0 ? (
              <>
                {safety!.high > 0 || safety!.medium > 0 ? (
                  <span className="text-muted-foreground/40">·</span>
                ) : null}
                <span className="text-blue-600 dark:text-blue-400" title={labels.low}>{safety!.low}</span>
              </>
            ) : null}
          </span>
        </button>
      ) : null}

      {decisions > 0 ? (
        <button type="button" onClick={() => onJump("decisions")} className={chipBase}>
          <ClipboardCheck className="h-3 w-3 text-amber-500" />
          {labels.decisions}
          <span className="font-semibold tabular-nums text-foreground">{decisions}</span>
        </button>
      ) : null}

      {timeline > 0 ? (
        <button type="button" onClick={() => onJump("timeline")} className={cn(chipBase)}>
          <Clock className="h-3 w-3 text-teal-500" />
          {labels.timeline}
          <span className="font-semibold tabular-nums text-foreground">{timeline}</span>
        </button>
      ) : null}
    </div>
  )
}
