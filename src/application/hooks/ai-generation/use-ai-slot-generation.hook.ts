// Shared engine for the patient-scoped structured-AI pipelines (medical
// summary + safety alerts). One hook owns everything the two features had in
// duplicate: model resolution (user pick → provider-key gating → free base
// fallback, part of the slot key so every model keeps its OWN result /
// loading / error slot), the content-bound patient/audience/locale/model slot,
// session-cache hydration, demo-snapshot seeding, the once-per-access-context
// auto-run guard, and the generate run body (via runGenerationJob).
//
// The feature hooks stay thin adapters: they own their public return shape,
// their persisted prefs store (storage name + field names are user data), the
// stream+parse producer, and the demo-snapshot source.
//
// Adopting clinical insights later (features/clinical-insights/hooks/*): its
// pipeline maps onto the same config — store = createAiResultStore<InsightsResult>,
// slot key already patient/audience/model/context shaped, run = its stream+parse body,
// demoSeed = its snapshot loader. The one divergence is its auto-run gate
// (isAutoRunEligibleModel: base-or-own-key models only, so browsing the picker
// never spends quota), which would arrive here as a config predicate like
// `autoRunEligible?: (resolvedModelId: string) => boolean` ANDed into the
// shouldAutoRunSummarySlot input. Not wired yet — insights was just merged and
// keeps its own hooks for now.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience, type Audience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { Locale } from '@/src/shared/i18n/i18n.config'
import { loadEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import { getModelDefinition, gateModelForKeys } from '@/src/shared/constants/ai-models.constants'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { DEMO_PATIENT_ID } from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  BUNDLE_CHANGED_EVENT,
  BUNDLE_CHANGE_SETTLED_EVENT,
} from '@/src/shared/utils/reset-on-bundle-change'
import { shouldAutoRunSummarySlot, shouldSeedDemoSlot } from './auto-run-policy'
import { runGenerationJob } from './run-generation-job'
import type { AiResultStore } from './create-ai-result-store'
import {
  useClinicalAiInput,
  type ClinicalAiDataInput,
} from './use-clinical-ai-input.hook'
import { patientAiSlotKey } from './ai-slot-key'
import { isOpenAiCompatibleRuntimeReady } from '@/src/shared/utils/openai-compatible.utils'
import {
  hasDirectModelAccess,
  modelContextLimit,
  modelRuntimeIdentity,
} from '@/src/shared/utils/model-access.utils'

/** Everything a feature's stream+parse producer gets from the engine. */
export interface AiSlotRunContext {
  /** Exact text whose signature is part of this run's slot key. */
  clinicalContext: string
  clinicalData: ClinicalAiDataInput | null
  catalog: SummarySourceCatalogEntry[]
  locale: Locale
  audience: Audience
  ai: ReturnType<typeof useUnifiedAi>
  /** The gated model this run actually streams on. */
  modelId: string
  /** Full context window, including the dynamic custom-endpoint setting. */
  contextLimit: number
}

export interface AiSlotDemoContext {
  audience: Audience
  catalog: SummarySourceCatalogEntry[]
  clinicalData: ClinicalAiDataInput
}

export interface AiSlotGenerationConfig<T> {
  /** Feature's free base model used by gateModel as its fallback. */
  defaultModelId: string
  /** User-picked model id from the feature's prefs store (pre-gating). */
  selectedModelId: string
  /** The persisted auto-run toggle. */
  autoRunEnabled: boolean
  /** When true, a MANUAL generate() is also refused until the patient and all
   *  selected clinical data have settled. Catalog building and auto-run always
   *  wait for dataReady (a run over partial data would cache a misleadingly
   *  thin result for 12h). */
  requireDataReadyToGenerate: boolean
  /** Optional test seam checked before user pick (safety: window.__safetyModelId). */
  resolveModelOverride?: () => string | undefined
  /** Module-level store from createAiResultStore<T>(). */
  store: AiResultStore<T>
  /** Slot key → encrypted-session-cache key. MUST keep the feature's
   *  historical format so already-stored user results stay readable. */
  cacheKeyFor: (slotKey: string) => string
  cacheMaxAgeMs: number
  /** Optional replacement cache reader (summary: legacy v5 patient fallback).
   *  Writes always go through cacheKeyFor. */
  loadCached?: (slotKey: string) => Promise<T | null>
  /** Streams + parses one generation; null = parse failed → 'PARSE_FAILED'.
   *  Any internal retry policy (summary retries once) lives in here. */
  run: (ctx: AiSlotRunContext) => Promise<T | null>
  /** Demo bundle seeding: build the pre-generated snapshot result (through the
   *  same parse/validate pipeline as a live reply) instead of burning an AI
   *  call. Only consulted for the demo patient + zh-TW + an empty, hydrated
   *  slot. The user's selected model does not affect snapshot eligibility. */
  demoSeed?: (ctx: AiSlotDemoContext) => T | null
}

export interface AiSlotGenerationReturn<T> {
  patientId: string
  hasPatient: boolean
  dataReady: boolean
  slotKey: string
  resolvedModelId: string
  clinicalData: ClinicalAiDataInput | null
  catalog: SummarySourceCatalogEntry[]
  result: T | undefined
  isRunning: boolean
  error: string | null
  /** True once this exact content-bound cache slot was restored. */
  isHydrated: boolean
  generate: () => Promise<void>
}

export function useAiSlotGeneration<T>(config: AiSlotGenerationConfig<T>): AiSlotGenerationReturn<T> {
  const {
    defaultModelId,
    selectedModelId,
    autoRunEnabled,
    requireDataReadyToGenerate,
    resolveModelOverride,
    store,
    cacheKeyFor,
    cacheMaxAgeMs,
    loadCached,
    run,
    demoSeed,
  } = config

  const {
    patientId,
    dataReady,
    clinicalContext,
    inputSignature,
    clinicalData: scopedClinicalData,
    catalog,
  } = useClinicalAiInput()
  const ai = useUnifiedAi()
  const stopAi = ai.stop
  const { locale } = useLanguage()
  // Auth must be resolved before an auto-run carries a Firebase token —
  // firing before the (possibly anonymous) session resolves would race
  // getProxyIdToken / the auth listener and get rejected.
  const { loading: authLoading, user, isAnonymous } = useAuth()
  const { apiKey, geminiKey, claudeKey, openAiCompatible } = useAllApiKeys()
  const { audience } = useAudience()

  // The model actually used — test seam → user pick (key-gated → free base) →
  // default. A stranded premium pick falls back to the free base. It's part of
  // the slot key, so every model keeps its OWN result / loading / error slot:
  // switching model just changes which slot the view reads, and an in-flight
  // generation keeps running and lands in its own model's slot.
  const resolvedModelId = useMemo(() => {
    const override = resolveModelOverride?.()
    if (typeof override === 'string' && override) return override
    return gateModelForKeys(
      selectedModelId,
      {
        openAiKey: apiKey,
        geminiKey,
        claudeKey,
        customAvailable: isOpenAiCompatibleRuntimeReady(openAiCompatible),
      },
      defaultModelId,
    )
  }, [resolveModelOverride, selectedModelId, apiKey, geminiKey, claudeKey, openAiCompatible, defaultModelId])

  const runtimeModelId = useMemo(
    () => modelRuntimeIdentity(resolvedModelId, openAiCompatible),
    [resolvedModelId, openAiCompatible],
  )
  const resolvedContextLimit = useMemo(
    () => modelContextLimit(resolvedModelId, openAiCompatible),
    [resolvedModelId, openAiCompatible],
  )

  // A cache/result slot is reusable only for the exact selected clinical
  // input. While data is loading or background-fetching inputSignature is
  // empty, so neither hydration nor generation can start from the patient card
  // alone. Locale is explicit because the requested output language can change
  // even when the FHIR input does not.
  const slotKey = patientAiSlotKey({
    patientId,
    audience,
    locale,
    modelId: runtimeModelId,
    inputSignature,
  })

  const selectedModelProvider = getModelDefinition(selectedModelId)?.provider
  const hasSelectedProviderKey = hasDirectModelAccess(
    selectedModelId,
    { openAiKey: apiKey, geminiKey, claudeKey },
    openAiCompatible,
  )
  const selectedModelReady = selectedModelProvider !== 'custom' || isOpenAiCompatibleRuntimeReady(openAiCompatible)
  // A failed anonymous auto-run must become eligible again after login (or
  // after the user adds their own provider key). The result cache remains
  // content-bound; only the once-per-access-context trigger
  // guard needs this extra identity.
  const accessScope = hasSelectedProviderKey ? 'own-key' : user ? `user:${user.uid}` : isAnonymous ? 'anonymous' : 'no-session'
  const bundleRevision = store((s) => s.bundleRevision)
  const autoRunIdentity = slotKey
    ? `${slotKey}::${accessScope}::bundle-${bundleRevision}`
    : ''

  const result = store((s) => (slotKey ? s.byKey[slotKey] : undefined))
  const setResult = store((s) => s.setResult)
  const isRunning = store((s) => (slotKey ? !!s.running[slotKey] : false))
  const error = store((s) => (slotKey ? s.errors[slotKey] ?? null : null))

  // Guests auto-run too (v0.25.x): callers apply the source-aware real-data
  // consent gate, results are cached 12h per patient, and the 50/day free quota
  // is still enforced server-side.
  const generate = useCallback(async () => {
    if (!slotKey) return
    if (requireDataReadyToGenerate && !dataReady) return
    await runGenerationJob({
      store,
      key: slotKey,
      cacheKey: cacheKeyFor(slotKey),
      produce: () =>
        run({
          clinicalContext,
          clinicalData: scopedClinicalData,
          catalog,
          locale,
          audience,
          ai,
          modelId: resolvedModelId,
          contextLimit: resolvedContextLimit,
        }),
    })
  }, [slotKey, requireDataReadyToGenerate, dataReady, store, cacheKeyFor, run, clinicalContext, scopedClinicalData, catalog, locale, audience, ai, resolvedModelId, resolvedContextLimit])

  // Restore the persisted result on (re)load BEFORE auto-run can fire, so a
  // refresh on the same patient reuses the cached result instead of re-billing.
  // The module store survives tab switches within a session, so the cache is
  // only read when the slot is empty (i.e. after a page reload). Reads the
  // store imperatively (not via a dep) so this stays correct under StrictMode's
  // double-invoke — each mount independently resolves to the hydrated slot.
  const [hydrated, setHydrated] = useState<string | null>(null)
  useEffect(() => {
    if (!slotKey) return
    if (store.getState().byKey[slotKey]) {
      const timer = window.setTimeout(() => setHydrated(slotKey), 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    void (async () => {
      const cached = loadCached
        ? await loadCached(slotKey)
        : await loadEncryptedCache<T>(cacheKeyFor(slotKey), cacheMaxAgeMs)
      if (cancelled) return
      if (cached) store.getState().setResult(slotKey, cached)
      setHydrated(slotKey)
    })()
    return () => { cancelled = true }
  }, [slotKey, store, loadCached, cacheKeyFor, cacheMaxAgeMs])

  const autoTriggeredRef = useRef<string | null>(null)

  // persistBundle()/clear() reset the result stores synchronously, then React
  // Query publishes the newly imported patient and clinical data. Without a
  // transition guard, that brief window makes the PREVIOUS patient's now-empty
  // slot look auto-run eligible and starts a redundant cloud request just
  // before the demo patient arrives. The import hook emits a settled event only
  // after React Query has published the new patient and clinical collection.
  const [bundleTransitionActive, setBundleTransitionActive] = useState(false)
  useEffect(() => {
    const begin = () => {
      stopAi()
      setBundleTransitionActive(true)
    }
    const settle = () => setBundleTransitionActive(false)
    window.addEventListener(BUNDLE_CHANGED_EVENT, begin)
    window.addEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    return () => {
      window.removeEventListener(BUNDLE_CHANGED_EVENT, begin)
      window.removeEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    }
  }, [stopAi])
  // A zh-TW demo snapshot is the only valid automatic result for the frozen
  // demo bundle. During a bundle switch React Query can briefly expose an
  // empty-but-not-loading clinical collection: the seed correctly waits for a
  // non-empty catalog, but the normal auto-run must wait too or it will send
  // that partial context to cloud AI and win the slot before the snapshot can
  // be installed. Manual generate() remains available and intentionally live.
  const demoSnapshotExpected =
    Boolean(demoSeed) &&
    patientId === DEMO_PATIENT_ID &&
    locale === 'zh-TW'

  // Demo bundle: seed the pre-generated snapshot instead of burning an AI call
  // on data whose answer is a constant. The snapshot is eligible regardless of
  // a model preference retained from the user's own data. Declared BEFORE the
  // auto-run effect and marks autoTriggeredRef first, so the same commit can't
  // also fire a live generation. A deliberate manual regenerate still uses the
  // selected model and replaces this slot's seeded result.
  useEffect(() => {
    if (!demoSeed) return
    if (!shouldSeedDemoSlot({
      hasDemoSeed: true,
      slotKey,
      hasResult: Boolean(result),
      hydratedSlotKey: hydrated,
      patientId,
      demoPatientId: DEMO_PATIENT_ID,
      locale,
      hasCatalog: catalog.length > 0,
    })) return
    if (!scopedClinicalData) return
    const seeded = demoSeed({ audience, catalog, clinicalData: scopedClinicalData })
    if (!seeded) return
    autoTriggeredRef.current = autoRunIdentity
    setResult(slotKey, seeded)
  }, [demoSeed, slotKey, autoRunIdentity, result, hydrated, patientId, locale, catalog, audience, scopedClinicalData, setResult])

  // Auto-run once per content-bound slot + access-context after hydration; a
  // failed attempt is NOT retried in a loop — the user regenerates manually.
  // The toggle is explicit authorization for every available selected model,
  // not only the Lite/base model: availability/key fallback has already been
  // applied in resolvedModelId.
  useEffect(() => {
    if (!shouldAutoRunSummarySlot({
      enabled: autoRunEnabled && selectedModelReady && !bundleTransitionActive && !demoSnapshotExpected,
      authLoading,
      slotKey,
      busy: isRunning,
      dataReady,
      hasResult: Boolean(result),
      hydratedSlotKey: hydrated,
      autoRunIdentity,
      triggeredIdentity: autoTriggeredRef.current,
    })) return
    autoTriggeredRef.current = autoRunIdentity
    void generate()
  }, [autoRunEnabled, selectedModelReady, bundleTransitionActive, demoSnapshotExpected, authLoading, slotKey, autoRunIdentity, isRunning, result, dataReady, hydrated, generate])

  return {
    patientId,
    hasPatient: !!patientId,
    dataReady,
    slotKey,
    resolvedModelId,
    clinicalData: scopedClinicalData,
    catalog,
    result,
    isRunning,
    error,
    isHydrated: !slotKey || hydrated === slotKey,
    generate,
  }
}
