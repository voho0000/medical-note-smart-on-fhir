"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { cn } from "@/src/shared/utils/cn.utils"
import type { SafetyAlert, SafetySeverity } from "@/src/core/entities/safety-alert.entity"

/** Renders an alert's cited source keys as a navigable citation (from parent). */
type RenderSources = (keys: string[], unsupportedKeys?: string[]) => ReactNode

const SEVERITY_BADGE: Record<SafetySeverity, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
}

// Patient-facing reminders deliberately avoid the danger-red hierarchy used
// for clinician risk triage. Importance remains visible, but the language and
// colour communicate "what to notice first" rather than imminent harm.
const PATIENT_SEVERITY_BADGE: Record<SafetySeverity, string> = {
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  medium: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
}

// An AI claim must be auditable at a glance. When the alert cites source keys,
// render the same superscript citation pill used by the Medical Summary cards
// (click → left panel resource). Plain-text evidence only renders as a fallback
// for alerts with no citable sources (不遮蔽: the trail never disappears
// entirely). Long fallback lists truncate with a plain-text "…等 n 筆" note.
const EVIDENCE_VISIBLE_MAX = 5

// Density tiers keep a large alert set from burying the sections below it:
//  - 'full'    — high-severity: everything visible, no interaction (default).
//  - 'compact' — medium/low: title + recommendation only; detail + evidence
//                fold behind a per-row toggle so the count stays scannable.
type Density = "full" | "compact"

function EvidenceInline({
  alert,
  label,
  renderSources,
  compact = false,
}: {
  alert: SafetyAlert
  label: string
  renderSources?: RenderSources
  compact?: boolean
}) {
  const { t } = useLanguage()
  const evidence = alert.evidence ?? []
  const sources = alert.sources ?? []
  // The cited source keys become the same superscript citation pill used by
  // the summary/decision cards (click → left panel resource).
  const sourcesEl = renderSources && sources.length > 0
    ? renderSources(sources, alert.unsupportedSourceKeys)
    : null
  if (sourcesEl) return <>{sourcesEl}</>
  if (evidence.length === 0) return null
  const visible = evidence.slice(0, compact ? 1 : EVIDENCE_VISIBLE_MAX)
  const hidden = evidence.length - visible.length
  const fallbackEvidence = visible.join("；")
  return (
    <span className="ml-1 inline text-[0.625rem] leading-none text-muted-foreground/70">
      （{label}：{fallbackEvidence}
      {hidden > 0 ? t.safetyAlerts.evidenceMore.replace("{count}", String(hidden)) : null}）
    </span>
  )
}

export function SafetyAlertCard({
  alert,
  density = "full",
  renderSources,
}: {
  alert: SafetyAlert
  density?: Density
  renderSources?: RenderSources
}) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const [expanded, setExpanded] = useState(false)
  const isPatient = audience === "patient"
  const safety = isPatient ? { ...t.safetyAlerts, ...t.safetyAlerts.patient } : t.safetyAlerts

  const severityLabel: Record<SafetySeverity, string> = {
    high: safety.severityHigh,
    medium: safety.severityMedium,
    low: safety.severityLow,
  }
  const badge = (
    <span
      className={cn(
        "shrink-0 h-fit rounded-md px-1.5 py-px text-[0.625rem] font-semibold",
        (isPatient ? PATIENT_SEVERITY_BADGE : SEVERITY_BADGE)[alert.severity],
      )}
    >
      {severityLabel[alert.severity]}
    </span>
  )

  if (density === "compact") {
    // A compact row: title + recommendation + source stay visible. Only the
    // right chevron toggles detail, so clickable citations are not nested
    // inside another button.
    const hasMore =
      !!alert.detail || (alert.evidence?.length ?? 0) > 0 || (alert.sources?.length ?? 0) > 0
    return (
      <div className="border-b border-border last:border-b-0 py-1.5">
        <div className="flex w-full items-start gap-2 text-left">
          {badge}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[0.8125rem] leading-snug text-foreground">
              {alert.title}
              <EvidenceInline
                alert={alert}
                label={t.safetyAlerts.evidenceLabel}
                renderSources={renderSources}
                compact
              />
            </p>
            {alert.recommendation ? (
              <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground break-words">
                → {alert.recommendation}
              </p>
            ) : null}
          </div>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t.medicalSummary.showLessItems
                  : t.medicalSummary.showMoreItems.replace("{count}", "1")
              }
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
        {expanded ? (
          <div className="mt-1 ml-10 pl-0">
            <p className="text-[0.8125rem] leading-snug text-muted-foreground break-words">{alert.detail}</p>
          </div>
        ) : null}
      </div>
    )
  }

  // Full tier — everything visible, no interaction.
  return (
    <div className="flex gap-2 py-2 border-b border-border last:border-b-0">
      {badge}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[0.8125rem] leading-snug text-foreground">
          {alert.title}
          <EvidenceInline alert={alert} label={t.safetyAlerts.evidenceLabel} renderSources={renderSources} compact />
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground break-words">
          {alert.detail}
        </p>
        {alert.recommendation ? (
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-foreground/80 break-words">
            → {alert.recommendation}
          </p>
        ) : null}
      </div>
    </div>
  )
}
