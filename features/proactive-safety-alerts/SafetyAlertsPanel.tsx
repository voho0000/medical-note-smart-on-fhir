"use client"

import { useMemo, type ReactNode } from "react"
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { SEVERITY_RANK, type SafetyScanResult } from "@/src/core/entities/safety-alert.entity"
import { SafetyAlertCard } from "./components/SafetyAlertCard"

// Presentational safety-alerts section. Scan state + controls (model / auto /
// trigger) may be owned by the parent so a larger surface can have one set of
// AI controls — this component only renders the section title, optional scan
// summary and the tiered alert cards.
interface SafetyAlertsPanelProps {
  result: SafetyScanResult | undefined
  isScanning: boolean
  error: string | null
  hasPatient: boolean
  /** Renders an alert's cited source keys as a navigable citation (owned by
   *  the parent, which holds the catalog resolver + navigation). */
  renderSources?: (keys: string[], unsupportedKeys?: string[]) => ReactNode
  /** Retries ONLY the safety scan (the summary call may have succeeded). */
  onRetry?: () => void
  retryLabel?: string
  /** Medical Summary supplies its own unified "care reminders & safety"
   *  card heading. Keep this true for any standalone reuse. */
  showTitle?: boolean
  /** Hide the "scanned N records..." line when embedded in dense summaries. */
  showScanSummary?: boolean
}

export function SafetyAlertsPanel({
  result,
  isScanning,
  error,
  hasPatient,
  renderSources,
  onRetry,
  retryLabel,
  showTitle = true,
  showScanSummary = true,
}: SafetyAlertsPanelProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  // Patient audience gets the friendlier "健康提醒" wording; clinicians keep the
  // clinical "安全警示" labels. Patient keys override the base set.
  const safety = t.safetyAlerts
  const sa = audience === 'patient' ? { ...safety, ...safety.patient } : safety

  // Severity-sorted tiers: high stays a full card, medium collapses to a
  // compact expandable row, and the (often long) low tier folds entirely
  // behind a counted toggle so a big scan doesn't bury the sections below.
  const { high, medium, low } = useMemo(() => {
    const sorted = [...(result?.alerts ?? [])].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    )
    return {
      high: sorted.filter((a) => a.severity === "high"),
      medium: sorted.filter((a) => a.severity === "medium"),
      low: sorted.filter((a) => a.severity === "low"),
    }
  }, [result])
  const initialScan = isScanning && !result

  return (
    <div className="space-y-2">
      {showTitle ? (
        <h3 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{sa.title}</h3>
      ) : null}

      {!hasPatient ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {sa.emptyNoPatient}
        </div>
      ) : initialScan ? (
        <div className="py-8 flex flex-col items-center gap-2">
          <StreamingIndicator label={sa.scanning} />
          <p className="text-xs text-muted-foreground/70">{sa.scanningHint}</p>
        </div>
      ) : (
        <>
          {/* Summary or first-run intro */}
          {result ? (
            result.alerts.length > 0 && showScanSummary ? (
              <p className="text-xs leading-snug text-muted-foreground">
                {sa.foundSummary
                  .replace("{scanned}", String(result.scannedCount))
                  .replace("{count}", String(result.alerts.length))}
              </p>
            ) : result.alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/40 px-2.5 py-1.5 text-xs text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {sa.emptyNoRisk}
              </div>
            ) : null
          ) : (
            <p className="text-xs leading-snug text-muted-foreground">{sa.scanIntro}</p>
          )}

          {error ? (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/40 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{error === "PARSE_FAILED" ? sa.parseError : error}</span>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  {retryLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Tiered alert cards: high (full) → medium/low (compact).
              Caps then scrolls so a big scan never dominates the column. */}
          {result && result.alerts.length > 0 ? (
            <div className="max-h-[24rem] overflow-y-auto scrollbar-thin-persistent">
              {high.map((alert) => (
                <SafetyAlertCard key={alert.id} alert={alert} density="full" renderSources={renderSources} />
              ))}
              {medium.map((alert) => (
                <SafetyAlertCard key={alert.id} alert={alert} density="compact" renderSources={renderSources} />
              ))}
              {/* Low-risk alerts are shown inline (no toggle) — the card's
                  30rem height cap + scroll handles a long list. */}
              {low.map((alert) => (
                <SafetyAlertCard key={alert.id} alert={alert} density="compact" renderSources={renderSources} />
              ))}
            </div>
          ) : null}

          {/* AI disclaimer — pure-AI output, clinician must verify */}
          {result && result.alerts.length > 0 ? (
            <p className="text-[0.65rem] leading-snug text-muted-foreground/70">
              {sa.disclaimer}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
