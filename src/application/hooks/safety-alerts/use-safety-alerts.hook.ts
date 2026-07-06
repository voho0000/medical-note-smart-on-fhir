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
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
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
import {
  getSourceCatalog,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult, SafetySeverity } from '@/src/core/entities/safety-alert.entity'
import {
  DEMO_PATIENT_ID,
  demoSafetyScanSnapshots,
} from '@/src/infrastructure/demo/demo-ai-snapshots'

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
      // Default ON to match medical-summary autoGenerate: the Medical Summary
      // tab shows ONE "自動產生" toggle governing both, so their defaults must
      // agree or the toggle would read ON while the scan silently stays manual.
      autoScan: true,
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
  /** Resolve a source-list key an alert cited (e.g. "L3") to its bundle
   *  record, for click-to-navigate citations. undefined = unknown/hallucinated. */
  resolveSource: (key: string) => SummarySourceCatalogEntry | undefined
}

export function useSafetyAlerts(): UseSafetyAlertsReturn {
  const { patient } = usePatient()
  const { getFullClinicalContext } = useClinicalContext('insights')
  const clinicalData = useClinicalData() as unknown as SummaryCatalogInput | null
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  // Auth must be resolved before the proxy call carries a Firebase token —
  // otherwise an early auto-scan races the auth listener and the proxy rejects
  // it with "sign-in required".
  const { loading: authLoading } = useAuth()

  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()

  const { audience } = useAudience()
  const patientId = patient?.id ?? ''
  // Cache scope = patient + audience. The medical (安全警示) and patient (健康提醒)
  // scans are different outputs, so each is cached & scanned independently;
  // switching audience swaps to the matching version (or generates it).
  const scanKey = patientId ? `${patientId}::${audience}` : ''
  const result = useSafetyAlertsStore((s) => (scanKey ? s.byPatient[scanKey] : undefined))
  const setResult = useSafetyAlertsStore((s) => s.setResult)
  const clearResult = useSafetyAlertsStore((s) => s.clear)
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)
  const modelId = useSafetyPrefsStore((s) => s.modelId)
  const setModelId = useSafetyPrefsStore((s) => s.setModelId)

  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deterministic citable-record catalog (same builder the summary uses). Fed
  // to the prompt so alerts can cite keys, and kept as a lookup so the UI can
  // resolve those keys into click-to-navigate citations.
  const catalog = useMemo(
    () => (clinicalData ? getSourceCatalog(clinicalData) : []),
    [clinicalData],
  )
  const catalogByKey = useMemo(
    () => new Map(catalog.map((c) => [c.key, c])),
    [catalog],
  )
  const resolveSource = useCallback(
    (key: string) => catalogByKey.get(key.trim()),
    [catalogByKey],
  )

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

  // Clear a stale error when the patient or audience changes.
  useEffect(() => {
    setError(null)
  }, [scanKey])

  // Bumped by setModel to invalidate an in-flight scan: its stream came from
  // the OLD model, so its output must be neither shown nor cached as the new
  // model's result (setModel clears the cache precisely to force a re-scan).
  const scanGenRef = useRef(0)

  const scan = useCallback(async () => {
    if (!scanKey || isScanning) return
    const gen = scanGenRef.current
    setIsScanning(true)
    setError(null)
    try {
      const clinicalContext = getFullClinicalContext()
      const messages = generateSafetyAlertsUseCase.buildMessages({
        clinicalContext,
        locale: locale === 'zh-TW' ? 'zh-TW' : 'en',
        audience: audience === 'patient' ? 'patient' : 'medical',
        catalog,
      })

      let full = ''
      await ai.stream(messages, {
        modelId: resolvedModelId,
        onChunk: (chunk: string) => {
          full = chunk
        },
      })

      // Model changed mid-scan — discard silently; the re-armed auto-scan (or
      // a manual re-scan) runs on the new model.
      if (gen !== scanGenRef.current) return

      const parsed = generateSafetyAlertsUseCase.parseScanResult(full)
      if (!parsed) {
        setError('PARSE_FAILED')
        return
      }
      // "掃描 N 筆" must be a deterministic app-side count, not the model's
      // self-reported number (which varied 30/54/68 across runs on the same
      // patient) — use the record count we actually put in the SOURCE LIST.
      const result = { ...parsed, scannedCount: catalog.length }
      setResult(scanKey, result)
      // Persist so a refresh reuses it instead of re-scanning (re-billing).
      void saveEncryptedCache(safetyCacheKey(scanKey), result)
    } catch (err) {
      if (gen === scanGenRef.current) setError(getUserErrorMessage(err))
    } finally {
      setIsScanning(false)
    }
  }, [scanKey, isScanning, getFullClinicalContext, locale, audience, catalog, ai, setResult, resolvedModelId])

  // Restore a persisted scan on (re)load before auto-scan can fire, so a refresh
  // on the same patient reuses the cached result instead of re-billing. The
  // module store survives tab switches within a session, so we only read the
  // cache when it's empty (i.e. after a page reload). Reads the store
  // imperatively (not via a dep) so this stays correct under StrictMode's
  // double-invoke — each mount independently resolves to `hydratedPatient`.
  const [hydratedScan, setHydratedScan] = useState<string | null>(null)
  useEffect(() => {
    if (!scanKey) return
    if (useSafetyAlertsStore.getState().byPatient[scanKey]) {
      setHydratedScan(scanKey)
      return
    }
    let cancelled = false
    void loadEncryptedCache<SafetyScanResult>(safetyCacheKey(scanKey), SAFETY_CACHE_MAX_AGE_MS).then((cached) => {
      if (cancelled) return
      if (cached) setResult(scanKey, cached)
      setHydratedScan(scanKey)
    })
    return () => { cancelled = true }
  }, [scanKey, setResult])

  const autoTriggeredRef = useRef<string | null>(null)

  // Demo bundle: seed the pre-generated scan snapshot instead of burning an AI
  // call (see use-medical-summary.hook.ts — same rules: demo patient + zh-TW +
  // default model + nothing cached; snapshot goes through the same
  // parseScanResult validation as a live reply; re-scan / model switch stay live).
  useEffect(() => {
    if (!scanKey || result || hydratedScan !== scanKey) return
    if (patientId !== DEMO_PATIENT_ID || locale !== 'zh-TW') return
    if (modelId !== SAFETY_ALERTS_MODEL_ID) return
    if (catalog.length === 0) return
    const snapshot = demoSafetyScanSnapshots[audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(snapshot))
    if (!parsed) return
    autoTriggeredRef.current = scanKey
    // Same deterministic count rule as a live scan (see scan() above).
    setResult(scanKey, { ...parsed, scannedCount: catalog.length })
  }, [scanKey, result, hydratedScan, patientId, locale, modelId, catalog, audience, setResult])

  // Auto-scan: fire once per patient when enabled and there's no result — but
  // only AFTER cache hydration has settled, so a refresh doesn't race the
  // restore and re-bill. The ref guard means a failed auto-scan is NOT retried
  // in a loop; the user re-scans manually.
  useEffect(() => {
    if (!autoScan || authLoading || !scanKey || isScanning || result) return
    if (hydratedScan !== scanKey) return
    if (autoTriggeredRef.current === scanKey) return
    autoTriggeredRef.current = scanKey
    void scan()
  }, [autoScan, authLoading, scanKey, isScanning, result, hydratedScan, scan])

  // Changing the model invalidates the cached scan (it was produced by the old
  // model) and re-arms auto-scan, so "重新掃描" / auto-scan re-runs on the new
  // model instead of showing a stale result.
  const setModel = useCallback((id: string) => {
    // Invalidate + abort any scan still streaming on the old model BEFORE
    // clearing the cache — otherwise its result landed after the clear and was
    // displayed (and persisted) as if the new model produced it.
    scanGenRef.current += 1
    ai.stop()
    setModelId(id)
    if (scanKey) {
      clearResult(scanKey)
      removeEncryptedCache(safetyCacheKey(scanKey))
    }
    autoTriggeredRef.current = null
  }, [setModelId, scanKey, clearResult, ai])

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
    resolveSource,
  }
}

/** Severity breakdown shape for the section-nav chip (owned by the Medical
 *  Summary tab, which computes it from the single useSafetyAlerts result). */
export interface SafetyAlertCounts extends Record<SafetySeverity, number> {
  total: number
}
