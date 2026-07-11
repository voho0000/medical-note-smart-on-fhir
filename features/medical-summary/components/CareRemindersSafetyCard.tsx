"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import type { SafetyScanResult } from "@/src/core/entities/safety-alert.entity"
import { SafetyAlertsPanel } from "@/features/proactive-safety-alerts/SafetyAlertsPanel"

interface CareRemindersSafetyCardProps {
  result: SafetyScanResult | undefined
  isScanning: boolean
  error: string | null
  hasPatient: boolean
  renderSources?: (keys: string[], unsupportedKeys?: string[]) => ReactNode
  onRetry?: () => void
  retryLabel?: string
  title: string
}

/**
 * Fixed Medical Summary card for the same audience-aware safety analysis:
 * clinicians see proactive risk triage; patients see calm health reminders.
 * Keeping one card and one scan prevents the two labels from looking like
 * separate products while preserving their deliberately different language.
 */
export function CareRemindersSafetyCard({
  result,
  isScanning,
  error,
  hasPatient,
  renderSources,
  onRetry,
  retryLabel,
  title,
}: CareRemindersSafetyCardProps) {
  const updatingExistingResult = isScanning && Boolean(result)

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" aria-labelledby="care-reminders-safety-title">
      <h3
        id="care-reminders-safety-title"
        className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground"
      >
        <span className="min-w-0 flex-1">{title}</span>
        {updatingExistingResult ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" /> : null}
      </h3>
      <SafetyAlertsPanel
        result={result}
        isScanning={isScanning}
        error={error}
        hasPatient={hasPatient}
        renderSources={renderSources}
        onRetry={onRetry}
        retryLabel={retryLabel}
        showTitle={false}
        showScanSummary={false}
      />
    </section>
  )
}
