// Medical Summary hook — mirrors use-safety-alerts.hook.ts: runs the structured
// generation on the selected summary model, verifies citations against the bundle, and
// caches per patient+audience so tab switches / reloads don't re-bill.
//
// Auto-generate policy: when enabled, every available selected model runs once
// for an empty patient+audience+model slot after cache/auth hydration.
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
import {
  BUNDLE_CHANGED_EVENT,
  BUNDLE_CHANGE_SETTLED_EVENT,
  resetOnBundleChange,
} from '@/src/shared/utils/reset-on-bundle-change'
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
  generateMedicalSummaryUseCase,
  getSourceCatalog,
  scopeDocumentSources,
  buildCoverageStats,
  buildLongitudinalInvestigationContext,
  MEDICAL_SUMMARY_MODEL_ID,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type {
  MedicalSummaryResult,
  SummaryCoverageStats,
} from '@/src/core/entities/medical-summary.entity'
import {
  DEMO_PATIENT_ID,
  demoMedicalSummarySnapshots,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import { shouldAutoRunSummarySlot } from './summary-auto-run-policy'

const SUMMARY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
// v6: clinician summaries now include the structured medication-reconciliation
// card. Older cached summaries do not contain that field and must regenerate.
const summaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary6', scanKey)
// The v6 schema change was clinician-only. Patient summaries produced under
// v5 remain valid, so use them as a fallback instead of making an audience
// switch look as though its saved summary disappeared.
const legacyPatientSummaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary5', scanKey)

interface MedicalSummaryStore {
  // All keyed by scanKey = patientId::audience::model — so each model keeps its
  // OWN result / loading / error. Switching model just changes which slot the
  // view reads; an in-flight generation keeps running and lands in its own
  // model's slot (user directive 2026-07-07: don't abort on switch, show each
  // model's result when that model is selected).
  byPatient: Record<string, MedicalSummaryResult>
  generating: Record<string, boolean>
  errors: Record<string, string | null>
  setResult: (scanKey: string, result: MedicalSummaryResult) => void
  clear: (scanKey: string) => void
  setGenerating: (scanKey: string, value: boolean) => void
  setError: (scanKey: string, error: string | null) => void
}

const useMedicalSummaryStore = create<MedicalSummaryStore>((set) => ({
  byPatient: {},
  generating: {},
  errors: {},
  setResult: (scanKey, result) =>
    set((s) => ({ byPatient: { ...s.byPatient, [scanKey]: result } })),
  clear: (scanKey) =>
    set((s) => {
      const next = { ...s.byPatient }
      delete next[scanKey]
      return { byPatient: next }
    }),
  setGenerating: (scanKey, value) =>
    set((s) => ({ generating: { ...s.generating, [scanKey]: value } })),
  setError: (scanKey, error) =>
    set((s) => ({ errors: { ...s.errors, [scanKey]: error } })),
}))

// Wipe cached summaries when a new bundle is imported so nothing stale renders
// against fresh clinical data.
resetOnBundleChange(() =>
  useMedicalSummaryStore.setState({ byPatient: {}, generating: {}, errors: {} }),
)

interface SummaryPrefsStore {
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}

export const useSummaryPrefsStore = create<SummaryPrefsStore>()(
  persist(
    (set) => ({
      // Default OFF until first-run onboarding records an explicit choice. This
      // prevents a new patient's data from reaching cloud AI before consent.
      autoGenerate: false,
      setAutoGenerate: (value) => set({ autoGenerate: value }),
      modelId: MEDICAL_SUMMARY_MODEL_ID,
      setModelId: (id) => set({ modelId: id }),
    }),
    {
      name: 'medical-summary-prefs',
      onRehydrateStorage: () => (state) => {
        if (state && !isModelId(state.modelId)) state.modelId = MEDICAL_SUMMARY_MODEL_ID
      },
    },
  ),
)

export interface UseMedicalSummaryReturn {
  result: MedicalSummaryResult | undefined
  coverage: SummaryCoverageStats | null
  isGenerating: boolean
  error: string | null
  hasPatient: boolean
  dataReady: boolean
  /** True once this exact patient+audience+model cache slot was restored. */
  isHydrated: boolean
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
  model: string
  setModel: (id: string) => void
  generate: () => Promise<void>
}

export function useMedicalSummary(): UseMedicalSummaryReturn {
  const { patient } = usePatient()
  // Same data-selection profile as insights — the summary is insight-family.
  const { getFullClinicalContext, includedDocumentIds } = useClinicalContext('insights')
  const clinicalData = useClinicalData() as unknown as
    | (SummaryCatalogInput & { isLoading?: boolean; error?: unknown })
    | null
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  // authLoading still gates auto-generate: firing before the (possibly
  // anonymous) session resolves would race getProxyIdToken on first load.
  const { loading: authLoading, user, isAnonymous } = useAuth()
  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()
  const { audience } = useAudience()

  const patientId = patient?.id ?? ''
  const autoGenerate = useSummaryPrefsStore((s) => s.autoGenerate)
  const setAutoGenerate = useSummaryPrefsStore((s) => s.setAutoGenerate)
  const modelId = useSummaryPrefsStore((s) => s.modelId)
  const setModelId = useSummaryPrefsStore((s) => s.setModelId)

  // The model actually used — a stranded premium pick falls back to the free
  // base. It's part of scanKey, so every model keeps its OWN result / loading /
  // error slot: switching model just changes which slot the view reads, and an
  // in-flight generation keeps running and lands in its own model's slot.
  const resolvedModelId = useMemo(() => {
    const def = getModelDefinition(modelId)
    const hasProviderKey = def
      ? def.provider === 'openai' ? !!apiKey : def.provider === 'gemini' ? !!geminiKey : !!claudeKey
      : false
    return gateModel(modelId, hasProviderKey, MEDICAL_SUMMARY_MODEL_ID)
  }, [modelId, apiKey, geminiKey, claudeKey])

  const scanKey = patientId ? `${patientId}::${audience}::${resolvedModelId}` : ''
  const selectedModelProvider = getModelDefinition(modelId)?.provider
  const hasSelectedProviderKey =
    selectedModelProvider === 'openai' ? !!apiKey :
    selectedModelProvider === 'gemini' ? !!geminiKey :
    selectedModelProvider === 'claude' ? !!claudeKey : false
  // A failed anonymous auto-run must become eligible again after login (or
  // after the user adds their own provider key). The result cache remains
  // patient+audience+model scoped; only the once-per-access-context trigger
  // guard needs this extra identity.
  const accessScope = hasSelectedProviderKey ? 'own-key' : user ? `user:${user.uid}` : isAnonymous ? 'anonymous' : 'no-session'
  const autoRunIdentity = scanKey
    ? `${scanKey}::${accessScope}`
    : ''

  const result = useMedicalSummaryStore((s) => (scanKey ? s.byPatient[scanKey] : undefined))
  const setResult = useMedicalSummaryStore((s) => s.setResult)
  const isGenerating = useMedicalSummaryStore((s) => (scanKey ? !!s.generating[scanKey] : false))
  const setGenerating = useMedicalSummaryStore((s) => s.setGenerating)
  const error = useMedicalSummaryStore((s) => (scanKey ? s.errors[scanKey] ?? null : null))
  const setError = useMedicalSummaryStore((s) => s.setError)

  const dataReady = !!clinicalData && !clinicalData.isLoading && !clinicalData.error

  // Deterministic pieces — catalog for citations, coverage for the coverage
  // card. Both recompute only when the bundle changes.
  const catalog = useMemo(
    () => (dataReady && clinicalData
      ? scopeDocumentSources(getSourceCatalog(clinicalData), includedDocumentIds)
      : []),
    [dataReady, clinicalData, includedDocumentIds],
  )
  const coverage = useMemo(
    () => (dataReady && clinicalData ? buildCoverageStats(clinicalData) : null),
    [dataReady, clinicalData],
  )
  const longitudinalInvestigationContext = useMemo(
    () => (dataReady && clinicalData ? buildLongitudinalInvestigationContext(clinicalData, catalog) : ''),
    [dataReady, clinicalData, catalog],
  )

  // Guests auto-generate too (v0.25.x): the onboarding step is an explicit
  // opt-in (with a PHI-upload note), the result is cached 12h per patient, and
  // the safety scan already behaved this way — a signed-in-only gate here made
  // the shared "auto AI" switch look broken for guests. Their 50/day free
  // quota is still enforced server-side.
  const generate = useCallback(async () => {
    if (!scanKey || !dataReady) return
    // Guard per-model: never double-start the SAME model's generation, but a
    // different model MAY generate concurrently — each writes to its own slot,
    // so switching model never cancels or stomps another model's run.
    if (useMedicalSummaryStore.getState().generating[scanKey]) return
    const myScanKey = scanKey
    setGenerating(myScanKey, true)
    setError(myScanKey, null)
    try {
      const clinicalContext = [getFullClinicalContext(), longitudinalInvestigationContext]
        .filter(Boolean)
        .join('\n\n')
      const messages = generateMedicalSummaryUseCase.buildMessages({
        clinicalContext,
        catalog,
        locale: locale === 'zh-TW' ? 'zh-TW' : 'en',
        audience: audience === 'patient' ? 'patient' : 'medical',
      })

      const streamOnce = async () => {
        let full = ''
        await ai.stream(messages, {
          modelId: resolvedModelId,
          onChunk: (chunk: string) => {
            full = chunk
          },
        })
        return generateMedicalSummaryUseCase.parseResult(full)
      }

      // Flash-Lite occasionally returns malformed/truncated JSON on large
      // contexts; one silent retry mirrors the user pressing 重新產生 (which
      // reliably recovers). Exactly one — never a loop.
      let parsed = await streamOnce()
      if (!parsed) parsed = await streamOnce()
      if (!parsed) {
        setError(myScanKey, 'PARSE_FAILED')
        return
      }
      // Always commit to THIS run's own model slot — even if the user has since
      // switched away, the result is stored and shows when they switch back.
      const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, catalog)
      setResult(myScanKey, finalized)
      void saveEncryptedCache(summaryCacheKey(myScanKey), finalized)
    } catch (err) {
      setError(myScanKey, getUserErrorMessage(err))
    } finally {
      setGenerating(myScanKey, false)
    }
  }, [scanKey, dataReady, getFullClinicalContext, longitudinalInvestigationContext, catalog, locale, audience, ai, setResult, setGenerating, setError, resolvedModelId])

  // Restore the persisted result before auto-generate can fire (see safety
  // hook for the StrictMode rationale of reading the store imperatively).
  const [hydrated, setHydrated] = useState<string | null>(null)
  useEffect(() => {
    if (!scanKey) return
    if (useMedicalSummaryStore.getState().byPatient[scanKey]) {
      const timer = window.setTimeout(() => setHydrated(scanKey), 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    void (async () => {
      let cached = await loadEncryptedCache<MedicalSummaryResult>(
        summaryCacheKey(scanKey),
        SUMMARY_CACHE_MAX_AGE_MS,
      )
      if (!cached && audience === 'patient') {
        cached = await loadEncryptedCache<MedicalSummaryResult>(
          legacyPatientSummaryCacheKey(scanKey),
          SUMMARY_CACHE_MAX_AGE_MS,
        )
      }
      if (cancelled) return
      if (cached) setResult(scanKey, cached)
      setHydrated(scanKey)
    })()
    return () => { cancelled = true }
  }, [audience, scanKey, setResult])

  const autoTriggeredRef = useRef<string | null>(null)

  // Store reset happens before React Query publishes the replacement bundle.
  // Suppress auto-run in that window so the previous patient's empty slot
  // cannot launch a redundant cloud request.
  const [bundleTransitionActive, setBundleTransitionActive] = useState(false)
  useEffect(() => {
    const begin = () => setBundleTransitionActive(true)
    const settle = () => setBundleTransitionActive(false)
    window.addEventListener(BUNDLE_CHANGED_EVENT, begin)
    window.addEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    return () => {
      window.removeEventListener(BUNDLE_CHANGED_EVENT, begin)
      window.removeEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    }
  }, [])
  const demoSnapshotExpected = patientId === DEMO_PATIENT_ID && locale === 'zh-TW'

  // Demo bundle: seed the pre-generated snapshot instead of burning an AI call
  // on data whose answer is a constant. Runs through the SAME parse → finalize
  // pipeline as a live reply, so citations verify against the real catalog.
  // It waits for the real demo catalog, while auto-run stays blocked for this
  // frozen patient. Manual regenerate still uses the selected model.
  useEffect(() => {
    if (!scanKey || result || hydrated !== scanKey) return
    if (patientId !== DEMO_PATIENT_ID || locale !== 'zh-TW') return
    if (!dataReady || catalog.length === 0) return
    const snapshot = demoMedicalSummarySnapshots[audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
    if (!parsed) return
    autoTriggeredRef.current = autoRunIdentity
    setResult(scanKey, generateMedicalSummaryUseCase.finalizeResult(parsed, catalog))
  }, [scanKey, autoRunIdentity, result, hydrated, patientId, locale, dataReady, catalog, audience, setResult])

  // Auto-generate once per patient+audience after hydration; a failed attempt
  // is NOT retried in a loop — the user regenerates manually.
  useEffect(() => {
    if (!shouldAutoRunSummarySlot({
      enabled: autoGenerate,
      blocked: bundleTransitionActive || demoSnapshotExpected,
      authLoading,
      slotKey: scanKey,
      busy: isGenerating,
      dataReady,
      hasResult: Boolean(result),
      hydratedSlotKey: hydrated,
      autoRunIdentity,
      triggeredIdentity: autoTriggeredRef.current,
    })) return
    // The toggle is explicit authorization for every available selected model,
    // not only the Lite/base model. Availability/key fallback has already been
    // applied in resolvedModelId.
    autoTriggeredRef.current = autoRunIdentity
    void generate()
  }, [autoGenerate, bundleTransitionActive, demoSnapshotExpected, authLoading, scanKey, autoRunIdentity, isGenerating, result, dataReady, hydrated, generate])

  // Switching model just changes which per-model slot the view reads — it does
  // NOT cancel or clear anything. The old model's in-flight run keeps going and
  // lands in its own slot; the new model shows its cached result, its spinner
  // if still generating, or auto-generates if it has neither (user directive
  // 2026-07-07).
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  return {
    result,
    coverage,
    isGenerating,
    error,
    hasPatient: !!patientId,
    dataReady,
    isHydrated: !scanKey || hydrated === scanKey,
    autoGenerate,
    setAutoGenerate,
    model: modelId,
    setModel,
    generate,
  }
}
