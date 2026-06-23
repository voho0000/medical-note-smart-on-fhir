"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ShieldAlert, ScanSearch, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { useSafetyAlerts } from "@/src/application/hooks/safety-alerts/use-safety-alerts.hook"
import { SafetyAlertCard } from "./components/SafetyAlertCard"
import { SafetyModelPicker } from "./components/SafetyModelPicker"

// Locked sub-tab inside Clinical Insights: pure-AI scan → fixed structured cards.
// No editable prompt (it lives in the core use-case) — fixed output + fixed UI.
// The MODEL, however, is user-selectable (independent of the chat model).
export function SafetyAlertsPanel() {
  const { t } = useLanguage()
  const { result, isScanning, error, hasPatient, autoScan, setAutoScan, model, setModel, scan } = useSafetyAlerts()

  return (
    <div className="space-y-3 py-1">
      {/* Header: title + proactive badge (left); model picker + auto-scan +
          scan/re-scan (top-right). Wraps on narrow widths so nothing clips. */}
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <h2 className="text-base font-semibold text-foreground">{t.safetyAlerts.title}</h2>
        <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[0.6875rem] font-medium text-blue-700 dark:text-blue-300">
          {t.safetyAlerts.proactiveBadge}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <SafetyModelPicker model={model} onSelectModel={setModel} />
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
            title={t.safetyAlerts.autoScanTooltip}
          >
            <Switch checked={autoScan} onCheckedChange={setAutoScan} className="scale-90" />
            {t.safetyAlerts.autoScan}
          </label>
          {hasPatient && !isScanning ? (
            <Button onClick={() => scan()} size="sm" variant="outline" className="gap-1.5">
              {result ? <RefreshCw className="h-4 w-4" /> : <ScanSearch className="h-4 w-4" />}
              {result ? t.safetyAlerts.rescan : t.safetyAlerts.scanButton}
            </Button>
          ) : null}
        </div>
      </div>

      {!hasPatient ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t.safetyAlerts.emptyNoPatient}
        </div>
      ) : isScanning ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <StreamingIndicator label={t.safetyAlerts.scanning} />
          <p className="text-xs text-muted-foreground/70">{t.safetyAlerts.scanningHint}</p>
        </div>
      ) : (
        <>
          {/* Summary or first-run intro */}
          {result ? (
            result.alerts.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t.safetyAlerts.foundSummary
                  .replace("{scanned}", String(result.scannedCount))
                  .replace("{count}", String(result.alerts.length))}
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {t.safetyAlerts.emptyNoRisk}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">{t.safetyAlerts.scanIntro}</p>
          )}

          {error ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error === "PARSE_FAILED" ? t.safetyAlerts.parseError : error}
            </div>
          ) : null}

          {/* Alert cards */}
          {result && result.alerts.length > 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-1">
              {result.alerts.map((alert) => (
                <SafetyAlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          ) : null}

          {/* AI disclaimer — pure-AI output, clinician must verify */}
          {result && result.alerts.length > 0 ? (
            <p className="pt-1 text-[0.6875rem] leading-relaxed text-muted-foreground/70">
              {t.safetyAlerts.disclaimer}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
