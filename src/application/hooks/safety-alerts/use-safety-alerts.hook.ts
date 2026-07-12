// Proactive Safety Alerts hook. Runs the pure-AI scan on the summary's selected
// model, parses the structured reply, and caches the result per
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
import { resetOnBundleChange } from '@/src/shared/utils/reset-on-bundle-change'
import { useAuth } from '@/src/application/providers/auth.provider'
import { getUserErrorMessage } from '@/src/core/errors'
import {
  saveEncryptedCache,
  loadEncryptedCache,
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
  scopeDocumentSources,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult, SafetySeverity } from '@/src/core/entities/safety-alert.entity'
import {
  DEMO_PATIENT_ID,
  demoSafetyScanSnapshots,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import { shouldAutoRunSummarySlot } from '@/src/application/hooks/medical-summary/summary-auto-run-policy'

// Persist a completed scan per-patient so a page reload reuses it instead of
// re-billing the model. Same lifecycle as the bundle: encrypted with the tab
// session key, purged after 12h or when the session can't decrypt it.
const SAFETY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const safetyCacheKey = (patientId: string) => aiResultCacheKey('safety', patientId)

interface SafetyAlertsStore {
  // Keyed by scanKey = patientId::audience::model, so each model keeps its own
  // result / scanning / error. Switching model changes which slot the view
  // reads; an in-flight scan keeps running and lands in its own model's slot
  // (per-model behaviour, matching the summary hook — user directive 2026-07-07).
  byPatient: Record<string, SafetyScanResult>
  scanning: Record<string, boolean>
  errors: Record<string, string | null>
  setResult: (scanKey: string, result: SafetyScanResult) => void
  clear: (scanKey: string) => void
  setScanning: (scanKey: string, value: boolean) => void
  setError: (scanKey: string, error: string | null) => void
}

// Module-level cache (survives tab switches; cleared when a patient is re-scanned).
const useSafetyAlertsStore = create<SafetyAlertsStore>((set) => ({
  byPatient: {},
  scanning: {},
  errors: {},
  setResult: (scanKey, result) =>
    set((s) => ({ byPatient: { ...s.byPatient, [scanKey]: result } })),
  clear: (scanKey) =>
    set((s) => {
      const next = { ...s.byPatient }
      delete next[scanKey]
      return { byPatient: next }
    }),
  setScanning: (scanKey, value) =>
    set((s) => ({ scanning: { ...s.scanning, [scanKey]: value } })),
  setError: (scanKey, error) =>
    set((s) => ({ errors: { ...s.errors, [scanKey]: error } })),
}))

// Importing a new bundle must wipe the previous bundle's scans so nothing stale
// renders against fresh clinical data.
resetOnBundleChange(() =>
  useSafetyAlertsStore.setState({ byPatient: {}, scanning: {}, errors: {} }),
)

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
      // Default OFF to match medical-summary autoGenerate. First-run onboarding
      // enables both only after the user explicitly consents to cloud AI.
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
  /** True once this exact patient+audience+model cache slot was restored. */
  isHydrated: boolean
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
  const { getFullClinicalContext, includedDocumentIds } = useClinicalContext('insights')
  const clinicalData = useClinicalData() as unknown as SummaryCatalogInput | null
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  // Auth must be resolved before the proxy call carries a Firebase token —
  // otherwise an early auto-scan races the auth listener and the proxy rejects
  // it with "sign-in required".
  const { loading: authLoading, user, isAnonymous } = useAuth()

  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()

  const { audience } = useAudience()
  const patientId = patient?.id ?? ''
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)
  const modelId = useSafetyPrefsStore((s) => s.modelId)
  const setModelId = useSafetyPrefsStore((s) => s.setModelId)

  // Effective model: test seam → user pref (key-gated → free base) → default.
  // Part of scanKey so every model keeps its own result / scanning / error slot.
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

  // Cache scope = patient + audience + model. The medical (安全警示) and patient
  // (健康提醒) scans are different outputs, and each model scans independently;
  // switching audience/model swaps to the matching slot (or generates it).
  const scanKey = patientId ? `${patientId}::${audience}::${resolvedModelId}` : ''
  const selectedModelProvider = getModelDefinition(modelId)?.provider
  const hasSelectedProviderKey =
    selectedModelProvider === 'openai' ? !!apiKey :
    selectedModelProvider === 'gemini' ? !!geminiKey :
    selectedModelProvider === 'claude' ? !!claudeKey : false
  const accessScope = hasSelectedProviderKey ? 'own-key' : user ? `user:${user.uid}` : isAnonymous ? 'anonymous' : 'no-session'
  const autoRunIdentity = scanKey
    ? `${scanKey}::${accessScope}`
    : ''
  const result = useSafetyAlertsStore((s) => (scanKey ? s.byPatient[scanKey] : undefined))
  const setResult = useSafetyAlertsStore((s) => s.setResult)
  const isScanning = useSafetyAlertsStore((s) => (scanKey ? !!s.scanning[scanKey] : false))
  const setScanning = useSafetyAlertsStore((s) => s.setScanning)
  const error = useSafetyAlertsStore((s) => (scanKey ? s.errors[scanKey] ?? null : null))
  const setError = useSafetyAlertsStore((s) => s.setError)

  // Deterministic citable-record catalog (same builder the summary uses). Fed
  // to the prompt so alerts can cite keys, and kept as a lookup so the UI can
  // resolve those keys into click-to-navigate citations.
  const catalog = useMemo(
    () => (clinicalData
      ? scopeDocumentSources(getSourceCatalog(clinicalData), includedDocumentIds)
      : []),
    [clinicalData, includedDocumentIds],
  )
  const catalogByKey = useMemo(
    () => new Map(catalog.map((c) => [c.key, c])),
    [catalog],
  )
  const resolveSource = useCallback(
    (key: string) => catalogByKey.get(key.trim()),
    [catalogByKey],
  )


  const scan = useCallback(async () => {
    if (!scanKey) return
    // Guard per-model: never double-start the SAME model's scan, but a different
    // model MAY scan concurrently — each writes to its own slot, so switching
    // model never cancels or stomps another model's scan.
    if (useSafetyAlertsStore.getState().scanning[scanKey]) return
    const myScanKey = scanKey
    setScanning(myScanKey, true)
    setError(myScanKey, null)
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

      const parsed = generateSafetyAlertsUseCase.parseScanResult(full, catalog)
      if (!parsed) {
        setError(myScanKey, 'PARSE_FAILED')
        return
      }
      // "掃描 N 筆" must be a deterministic app-side count, not the model's
      // self-reported number (which varied 30/54/68 across runs on the same
      // patient) — use the record count we actually put in the SOURCE LIST.
      const result = { ...parsed, scannedCount: catalog.length }
      // Always commit to THIS run's own model slot — even if the user switched
      // away, the result is stored and shows when they switch back.
      setResult(myScanKey, result)
      // Persist so a refresh reuses it instead of re-scanning (re-billing).
      void saveEncryptedCache(safetyCacheKey(myScanKey), result)
    } catch (err) {
      setError(myScanKey, getUserErrorMessage(err))
    } finally {
      setScanning(myScanKey, false)
    }
  }, [scanKey, getFullClinicalContext, locale, audience, catalog, ai, setResult, setScanning, setError, resolvedModelId])

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
      const timer = window.setTimeout(() => setHydratedScan(scanKey), 0)
      return () => window.clearTimeout(timer)
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
    if (resolvedModelId !== SAFETY_ALERTS_MODEL_ID) return
    if (catalog.length === 0) return
    const snapshot = demoSafetyScanSnapshots[audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(snapshot), catalog)
    if (!parsed) return
    autoTriggeredRef.current = autoRunIdentity
    // Same deterministic count rule as a live scan (see scan() above).
    setResult(scanKey, { ...parsed, scannedCount: catalog.length })
  }, [scanKey, autoRunIdentity, result, hydratedScan, patientId, locale, resolvedModelId, catalog, audience, setResult])

  // Auto-scan: fire once per patient when enabled and there's no result — but
  // only AFTER cache hydration has settled, so a refresh doesn't race the
  // restore and re-bill. The ref guard means a failed auto-scan is NOT retried
  // in a loop; the user re-scans manually.
  useEffect(() => {
    if (!shouldAutoRunSummarySlot({
      enabled: autoScan,
      authLoading,
      slotKey: scanKey,
      busy: isScanning,
      dataReady: true,
      hasResult: Boolean(result),
      hydratedSlotKey: hydratedScan,
      autoRunIdentity,
      triggeredIdentity: autoTriggeredRef.current,
    })) return
    // Mirrors the summary hook: the shared toggle authorizes every available
    // selected model, not only the Lite/base model.
    autoTriggeredRef.current = autoRunIdentity
    void scan()
  }, [autoScan, authLoading, scanKey, autoRunIdentity, isScanning, result, hydratedScan, scan])

  // Switching model just changes which per-model slot the view reads — it does
  // NOT cancel or clear anything. The old model's in-flight scan keeps going and
  // lands in its own slot; the new model shows its cached result, its spinner if
  // still scanning, or auto-scans if it has neither (user directive 2026-07-07).
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  return {
    result,
    isScanning,
    error,
    hasPatient: !!patientId,
    isHydrated: !scanKey || hydratedScan === scanKey,
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
