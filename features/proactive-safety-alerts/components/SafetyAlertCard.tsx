"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { cn } from "@/src/shared/utils/cn.utils"
import type { SafetyAlert, SafetySeverity } from "@/src/core/entities/safety-alert.entity"

const SEVERITY_BADGE: Record<SafetySeverity, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
}

export function SafetyAlertCard({ alert }: { alert: SafetyAlert }) {
  const { t } = useLanguage()
  const [showEvidence, setShowEvidence] = useState(false)

  const severityLabel: Record<SafetySeverity, string> = {
    high: t.safetyAlerts.severityHigh,
    medium: t.safetyAlerts.severityMedium,
    low: t.safetyAlerts.severityLow,
  }

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-b-0">
      <span
        className={cn(
          "shrink-0 h-fit rounded-md px-2 py-0.5 text-xs font-semibold",
          SEVERITY_BADGE[alert.severity],
        )}
      >
        {severityLabel[alert.severity]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-snug text-foreground">{alert.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground break-words">{alert.detail}</p>
        {alert.recommendation ? (
          <p className="mt-1 text-sm leading-relaxed text-foreground/80 break-words">
            → {alert.recommendation}
          </p>
        ) : null}
        {alert.evidence && alert.evidence.length > 0 ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              {showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {t.safetyAlerts.evidenceLabel}（{alert.evidence.length}）
            </button>
            {showEvidence ? (
              <ul className="mt-1 ml-1 space-y-0.5">
                {alert.evidence.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground break-words">
                    • {e}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
