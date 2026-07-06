"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { cn } from "@/src/shared/utils/cn.utils"
import type { SafetyAlert, SafetySeverity } from "@/src/core/entities/safety-alert.entity"

/** Renders an alert's cited source keys as a navigable citation (from parent). */
type RenderSources = (keys: string[]) => ReactNode

const SEVERITY_BADGE: Record<SafetySeverity, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
}

// An AI claim must be auditable at a glance. When the alert cites source keys,
// the navigable citation pill next to 依據 IS the audit trail (click → left
// panel resource) and the plain-text evidence list is redundant noise — so it
// only renders as a FALLBACK for alerts with no citable sources (不遮蔽: the
// trail never disappears entirely). Long fallback lists truncate with a
// plain-text "…等 n 筆" note.
const EVIDENCE_VISIBLE_MAX = 5

// Density tiers keep a large alert set from burying the sections below it:
//  - 'full'    — high-severity: everything visible, no interaction (default).
//  - 'compact' — medium/low: title + recommendation only; detail + evidence
//                fold behind a per-row toggle so the count stays scannable.
type Density = "full" | "compact"

function EvidenceList({
  alert,
  label,
  renderSources,
}: {
  alert: SafetyAlert
  label: string
  renderSources?: RenderSources
}) {
  const { t } = useLanguage()
  const evidence = alert.evidence ?? []
  const sources = alert.sources ?? []
  // The cited source keys become a navigable citation next to the 依據 label —
  // parity with the summary/decision cards (click → left panel resource).
  const sourcesEl = renderSources && sources.length > 0 ? renderSources(sources) : null
  if (evidence.length === 0 && !sourcesEl) return null
  const visible = evidence.slice(0, EVIDENCE_VISIBLE_MAX)
  const hidden = evidence.length - visible.length
  return (
    <div className="mt-1.5">
      <p className="flex items-center gap-0.5 text-[0.65rem] tracking-wide text-violet-500/80 dark:text-violet-400/80">
        {label}
        {sourcesEl}
      </p>
      {!sourcesEl && evidence.length > 0 ? (
        <ul className="mt-0.5 ml-1 space-y-0.5">
          {visible.map((e, i) => (
            <li key={i} className="text-xs text-muted-foreground/80 break-words">• {e}</li>
          ))}
          {hidden > 0 ? (
            <li className="text-xs text-muted-foreground/60">
              {t.safetyAlerts.evidenceMore.replace("{count}", String(hidden))}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
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
  const [expanded, setExpanded] = useState(false)

  const severityLabel: Record<SafetySeverity, string> = {
    high: t.safetyAlerts.severityHigh,
    medium: t.safetyAlerts.severityMedium,
    low: t.safetyAlerts.severityLow,
  }
  const badge = (
    <span
      className={cn(
        "shrink-0 h-fit rounded-md px-2 py-0.5 text-xs font-semibold",
        SEVERITY_BADGE[alert.severity],
      )}
    >
      {severityLabel[alert.severity]}
    </span>
  )

  if (density === "compact") {
    // A collapsible row — the whole header toggles detail + evidence. The
    // recommendation (the actionable line) stays visible even when collapsed.
    const hasMore =
      !!alert.detail || (alert.evidence?.length ?? 0) > 0 || (alert.sources?.length ?? 0) > 0
    return (
      <div className="border-b border-border last:border-b-0 py-2">
        <button
          type="button"
          onClick={() => hasMore && setExpanded((v) => !v)}
          className={cn(
            "flex w-full items-start gap-2.5 text-left",
            hasMore && "cursor-pointer",
          )}
          aria-expanded={hasMore ? expanded : undefined}
        >
          {badge}
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm leading-snug text-foreground">{alert.title}</span>
            {alert.recommendation ? (
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground break-words">
                → {alert.recommendation}
              </span>
            ) : null}
          </span>
          {hasMore ? (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/50 transition-transform",
                expanded && "rotate-180",
              )}
            />
          ) : null}
        </button>
        {expanded ? (
          <div className="mt-1.5 ml-[calc(0.625rem+2.5rem)] pl-0">
            <p className="text-sm leading-relaxed text-muted-foreground break-words">{alert.detail}</p>
            <EvidenceList alert={alert} label={t.safetyAlerts.evidenceLabel} renderSources={renderSources} />
          </div>
        ) : null}
      </div>
    )
  }

  // Full tier — everything visible, no interaction.
  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-b-0">
      {badge}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-snug text-foreground">{alert.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground break-words">{alert.detail}</p>
        {alert.recommendation ? (
          <p className="mt-1 text-sm leading-relaxed text-foreground/80 break-words">
            → {alert.recommendation}
          </p>
        ) : null}
        <EvidenceList alert={alert} label={t.safetyAlerts.evidenceLabel} renderSources={renderSources} />
      </div>
    </div>
  )
}
