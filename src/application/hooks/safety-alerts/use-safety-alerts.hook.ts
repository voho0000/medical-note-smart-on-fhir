// Proactive Safety Alerts hook. Runs the pure-AI scan on a FIXED fast model
// (Gemini Flash-Lite), parses the structured reply, and caches the result per
// patient so switching tabs doesn't re-run / re-bill. Supports a persisted
// "auto-scan" preference: when on, the scan fires once per patient automatically.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { getUserErrorMessage } from '@/src/core/errors'
import {
  generateSafetyAlertsUseCase,
  SAFETY_ALERTS_MODEL_ID,
} from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SafetyScanResult } from '@/src/core/entities/safety-alert.entity'

// The scan is pinned to a fast model (Gemini Flash-Lite). An E2E test may pin a
// different model via `window.__safetyModelId` (a test seam — never set in prod)
// so it can reuse the OpenAI mock-stream fixture.
function resolveSafetyModelId(): string {
  if (typeof window !== 'undefined') {
    const override = (window as { __safetyModelId?: string }).__safetyModelId
    if (typeof override === 'string' && override) return override
  }
  return SAFETY_ALERTS_MODEL_ID
}

interface SafetyAlertsStore {
  byPatient: Record<string, SafetyScanResult>
  setResult: (patientId: string, result: SafetyScanResult) => void
  clear: (patientId: string) => void
}

// Module-level cache (survives tab switches; cleared when a patient is re-scanned).
const useSafetyAlertsStore = create<SafetyAlertsStore>((set) => ({
  byPatient: {},
  setResult: (patientId, result) =>
    set((s) => ({ byPatient: { ...s.byPatient, [patientId]: result } })),
  clear: (patientId) =>
    set((s) => {
      const next = { ...s.byPatient }
      delete next[patientId]
      return { byPatient: next }
    }),
}))

// Persisted user preference: auto-scan on patient load vs manual button.
interface SafetyPrefsStore {
  autoScan: boolean
  setAutoScan: (value: boolean) => void
}
const useSafetyPrefsStore = create<SafetyPrefsStore>()(
  persist(
    (set) => ({
      autoScan: false,
      setAutoScan: (value) => set({ autoScan: value }),
    }),
    { name: 'safety-alerts-prefs' },
  ),
)

export interface UseSafetyAlertsReturn {
  result: SafetyScanResult | undefined
  isScanning: boolean
  error: string | null
  hasPatient: boolean
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  scan: () => Promise<void>
}

export function useSafetyAlerts(): UseSafetyAlertsReturn {
  const { patient } = usePatient()
  const { getFullClinicalContext } = useClinicalContext('insights')
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  // Auth must be resolved before the proxy call carries a Firebase token —
  // otherwise an early auto-scan races the auth listener and the proxy rejects
  // it with "sign-in required".
  const { loading: authLoading } = useAuth()

  const patientId = patient?.id ?? ''
  const result = useSafetyAlertsStore((s) => (patientId ? s.byPatient[patientId] : undefined))
  const setResult = useSafetyAlertsStore((s) => s.setResult)
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)

  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear a stale error when the patient changes (error is component state).
  useEffect(() => {
    setError(null)
  }, [patientId])

  const scan = useCallback(async () => {
    if (!patientId || isScanning) return
    setIsScanning(true)
    setError(null)
    try {
      const clinicalContext = getFullClinicalContext()
      const messages = generateSafetyAlertsUseCase.buildMessages({
        clinicalContext,
        locale: locale === 'zh-TW' ? 'zh-TW' : 'en',
      })

      let full = ''
      await ai.stream(messages, {
        modelId: resolveSafetyModelId(),
        onChunk: (chunk: string) => {
          full = chunk
        },
      })

      const parsed = generateSafetyAlertsUseCase.parseScanResult(full)
      if (!parsed) {
        setError('PARSE_FAILED')
        return
      }
      setResult(patientId, parsed)
    } catch (err) {
      setError(getUserErrorMessage(err))
    } finally {
      setIsScanning(false)
    }
  }, [patientId, isScanning, getFullClinicalContext, locale, ai, setResult])

  // Auto-scan: fire once per patient when enabled and there's no cached result.
  // The ref guard means a failed auto-scan is NOT retried in a loop — the user
  // re-scans manually. A new patient resets the guard (ref !== patientId).
  const autoTriggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoScan || authLoading || !patientId || isScanning || result) return
    if (autoTriggeredRef.current === patientId) return
    autoTriggeredRef.current = patientId
    void scan()
  }, [autoScan, authLoading, patientId, isScanning, result, scan])

  return {
    result,
    isScanning,
    error,
    hasPatient: !!patientId,
    autoScan,
    setAutoScan,
    scan,
  }
}
