// Proactive Safety Alerts hook. Runs the pure-AI scan on a FIXED fast model
// (Gemini Flash-Lite), parses the structured reply, and caches the result per
// patient so switching tabs doesn't re-run / re-bill. Supports a persisted
// "auto-scan" preference: when on, the scan fires once per patient automatically.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { getUserErrorMessage } from '@/src/core/errors'
import {
  saveEncryptedCache,
  loadEncryptedCache,
  removeEncryptedCache,
  aiResultCacheKey,
} from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  getModelDefinition,
  gateModel,
  isModelId,
} from '@/src/shared/constants/ai-models.constants'
import {
  generateSafetyAlertsUseCase,
  SAFETY_ALERTS_MODEL_ID,
} from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SafetyScanResult } from '@/src/core/entities/safety-alert.entity'

// Persist a completed scan per-patient so a page reload reuses it instead of
// re-billing the model. Same lifecycle as the bundle: encrypted with the tab
// session key, purged after 12h or when the session can't decrypt it.
const SAFETY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const safetyCacheKey = (patientId: string) => aiResultCacheKey('safety', patientId)

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

// Persisted user preferences: auto-scan on patient load, and the model the scan
// runs on (INDEPENDENT of the chat/insights model in ai-config-storage).
interface SafetyPrefsStore {
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}
// Exported so the first-run onboarding can set the auto-scan preference WITHOUT
// mounting the full useSafetyAlerts hook (which carries the auto-scan effect).
export const useSafetyPrefsStore = create<SafetyPrefsStore>()(
  persist(
    (set) => ({
      autoScan: false,
      setAutoScan: (value) => set({ autoScan: value }),
      modelId: SAFETY_ALERTS_MODEL_ID,
      setModelId: (id) => set({ modelId: id }),
    }),
    {
      name: 'safety-alerts-prefs',
      // The model lineup changes between releases — a persisted id that no
      // longer exists falls back to the default instead of dead-ending.
      onRehydrateStorage: () => (state) => {
        if (state && !isModelId(state.modelId)) state.modelId = SAFETY_ALERTS_MODEL_ID
      },
    },
  ),
)

export interface UseSafetyAlertsReturn {
  result: SafetyScanResult | undefined
  isScanning: boolean
  error: string | null
  hasPatient: boolean
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  /** User-chosen scan model (independent of the chat model). */
  model: string
  setModel: (id: string) => void
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

  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()

  const patientId = patient?.id ?? ''
  const result = useSafetyAlertsStore((s) => (patientId ? s.byPatient[patientId] : undefined))
  const setResult = useSafetyAlertsStore((s) => s.setResult)
  const clearResult = useSafetyAlertsStore((s) => s.clear)
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)
  const modelId = useSafetyPrefsStore((s) => s.modelId)
  const setModelId = useSafetyPrefsStore((s) => s.setModelId)

  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Effective model: test seam → user pref (key-gated → free base) → default.
  const resolvedModelId = useMemo(() => {
    if (typeof window !== 'undefined') {
      const override = (window as { __safetyModelId?: string }).__safetyModelId
      if (typeof override === 'string' && override) return override
    }
    const def = getModelDefinition(modelId)
    const hasProviderKey = def
      ? def.provider === 'openai' ? !!apiKey : def.provider === 'gemini' ? !!geminiKey : !!claudeKey
      : false
    return gateModel(modelId, hasProviderKey, SAFETY_ALERTS_MODEL_ID)
  }, [modelId, apiKey, geminiKey, claudeKey])

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
        modelId: resolvedModelId,
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
      // Persist so a refresh reuses it instead of re-scanning (re-billing).
      void saveEncryptedCache(safetyCacheKey(patientId), parsed)
    } catch (err) {
      setError(getUserErrorMessage(err))
    } finally {
      setIsScanning(false)
    }
  }, [patientId, isScanning, getFullClinicalContext, locale, ai, setResult, resolvedModelId])

  // Restore a persisted scan on (re)load before auto-scan can fire, so a refresh
  // on the same patient reuses the cached result instead of re-billing. The
  // module store survives tab switches within a session, so we only read the
  // cache when it's empty (i.e. after a page reload). Reads the store
  // imperatively (not via a dep) so this stays correct under StrictMode's
  // double-invoke — each mount independently resolves to `hydratedPatient`.
  const [hydratedPatient, setHydratedPatient] = useState<string | null>(null)
  useEffect(() => {
    if (!patientId) return
    if (useSafetyAlertsStore.getState().byPatient[patientId]) {
      setHydratedPatient(patientId)
      return
    }
    let cancelled = false
    void loadEncryptedCache<SafetyScanResult>(safetyCacheKey(patientId), SAFETY_CACHE_MAX_AGE_MS).then((cached) => {
      if (cancelled) return
      if (cached) setResult(patientId, cached)
      setHydratedPatient(patientId)
    })
    return () => { cancelled = true }
  }, [patientId, setResult])

  // Auto-scan: fire once per patient when enabled and there's no result — but
  // only AFTER cache hydration has settled, so a refresh doesn't race the
  // restore and re-bill. The ref guard means a failed auto-scan is NOT retried
  // in a loop; the user re-scans manually.
  const autoTriggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoScan || authLoading || !patientId || isScanning || result) return
    if (hydratedPatient !== patientId) return
    if (autoTriggeredRef.current === patientId) return
    autoTriggeredRef.current = patientId
    void scan()
  }, [autoScan, authLoading, patientId, isScanning, result, hydratedPatient, scan])

  // Changing the model invalidates the cached scan (it was produced by the old
  // model) and re-arms auto-scan, so "重新掃描" / auto-scan re-runs on the new
  // model instead of showing a stale result.
  const setModel = useCallback((id: string) => {
    setModelId(id)
    if (patientId) {
      clearResult(patientId)
      removeEncryptedCache(safetyCacheKey(patientId))
    }
    autoTriggeredRef.current = null
  }, [setModelId, patientId, clearResult])

  return {
    result,
    isScanning,
    error,
    hasPatient: !!patientId,
    autoScan,
    setAutoScan,
    model: modelId,
    setModel,
    scan,
  }
}
