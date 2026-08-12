// Compatibility projection for consumers that still render a Safety panel.
// Safety is generated, validated, retried, stored, and cached as a registered
// Medical Summary card; this hook owns no pipeline or persistence of its own.
'use client'

import { useCallback } from 'react'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult, SafetySeverity } from '@/src/core/entities/safety-alert.entity'
import type { ContextOverflowIssue } from '@/src/shared/utils/context-budget'
import type { UseMedicalSummaryReturn } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'

// Kept as a settings migration surface. It no longer controls a Safety
// generation pipeline or cache; the Summary preference is the runtime owner.
export { useSafetyPrefsStore } from '@/src/application/stores/safety-prefs.store'

export interface UseSafetyAlertsReturn {
  result: SafetyScanResult | undefined
  resultOwnerModelId: string | null
  resultOwnerRuntimeId: string | null
  isScanning: boolean
  error: string | null
  issue: ContextOverflowIssue | null
  hasPatient: boolean
  generationSlotKey: string
  isCurrentSlotGenerating: boolean
  readGenerationSlot: (slotKey: string) => {
    result: SafetyScanResult | undefined
    isRunning: boolean
    error: string | null
    issue: ContextOverflowIssue | null
  }
  isHydrated: boolean
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  model: string
  setModel: (id: string) => void
  scan: () => Promise<void>
  cancel: (slotKey?: string) => void
  restoreGenerationSlot: (slotKey: string, result: SafetyScanResult | undefined) => void
  resolveSource: (key: string) => SummarySourceCatalogEntry | undefined
}

export function useSafetyAlerts(summary: UseMedicalSummaryReturn): UseSafetyAlertsReturn {
  const readGenerationSlot = useCallback((slotKey: string) => {
    const slot = summary.readGenerationSlot(slotKey)
    return {
      result: slot.result?.safety,
      isRunning: slot.isRunning,
      error: slot.result?.cardErrors?.safety ?? null,
      issue: null,
    }
  }, [summary])

  const restoreGenerationSlot = useCallback((
    slotKey: string,
    result: SafetyScanResult | undefined,
  ) => {
    const current = summary.readGenerationSlot(slotKey).result
    if (!current) return
    summary.restoreGenerationSlot(slotKey, { ...current, safety: result })
  }, [summary])

  const result = summary.result?.safety
  return {
    result,
    resultOwnerModelId: result ? summary.resultOwnerModelId : null,
    resultOwnerRuntimeId: result ? summary.resultOwnerRuntimeId : null,
    isScanning: summary.isGenerating,
    error: summary.result?.cardErrors?.safety ?? null,
    issue: null,
    hasPatient: summary.hasPatient,
    generationSlotKey: summary.generationSlotKey,
    isCurrentSlotGenerating: summary.isCurrentSlotGenerating,
    readGenerationSlot,
    isHydrated: summary.isHydrated,
    autoScan: summary.autoGenerate,
    setAutoScan: summary.setAutoGenerate,
    model: summary.model,
    setModel: summary.setModel,
    scan: summary.generate,
    cancel: summary.cancel,
    restoreGenerationSlot,
    resolveSource: summary.resolveSource,
  }
}

export interface SafetyAlertCounts extends Record<SafetySeverity, number> {
  total: number
}
