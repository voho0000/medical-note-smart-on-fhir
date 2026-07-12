// Shared engine for the patient-scoped structured-AI pipelines (medical
// summary + safety alerts). One hook owns everything the two features had in
// duplicate: model resolution (user pick → provider-key gating → free base
// fallback, part of the slot key so every model keeps its OWN result /
// loading / error slot), the patientId::audience::model slot key, encrypted
// session-cache hydration, demo-snapshot seeding, the once-per-access-context
// auto-run guard, and the generate run body (via runGenerationJob).
//
// The feature hooks stay thin adapters: they own their public return shape,
// their persisted prefs store (storage name + field names are user data), the
// stream+parse producer, and the demo-snapshot source.
//
// Adopting clinical insights later (features/clinical-insights/hooks/*): its
// pipeline maps onto the same config — store = createAiResultStore<InsightsResult>,
// slot key already patient+audience+model shaped, run = its stream+parse body,
// demoSeed = its snapshot loader. The one divergence is its auto-run gate
// (isAutoRunEligibleModel: base-or-own-key models only, so browsing the picker
// never spends quota), which would arrive here as a config predicate like
// `autoRunEligible?: (resolvedModelId: string) => boolean` ANDed into the
// shouldAutoRunSummarySlot input. Not wired yet — insights was just merged and
// keeps its own hooks for now.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience, type Audience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import type { Locale } from '@/src/shared/i18n/i18n.config'
import { loadEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import { getModelDefinition, gateModel } from '@/src/shared/constants/ai-models.constants'
import {
  getSourceCatalog,
  scopeDocumentSources,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { DEMO_PATIENT_ID } from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  BUNDLE_CHANGED_EVENT,
  BUNDLE_CHANGE_SETTLED_EVENT,
} from '@/src/shared/utils/reset-on-bundle-change'
import { shouldAutoRunSummarySlot, shouldSeedDemoSlot } from './auto-run-policy'
import { runGenerationJob } from './run-generation-job'
import type { AiResultStore } from './create-ai-result-store'

type ClinicalDataInput = SummaryCatalogInput & { isLoading?: boolean; error?: unknown }

/** Everything a feature's stream+parse producer gets from the engine. */
export interface AiSlotRunContext {
  getFullClinicalContext: () => string
  clinicalData: ClinicalDataInput | null
  catalog: SummarySourceCatalogEntry[]
  locale: Locale
  audience: Audience
  ai: ReturnType<typeof useUnifiedAi>
  /** The gated model this run actually streams on. */
  modelId: string
}

export interface AiSlotDemoContext {
  audience: Audience
  catalog: SummarySourceCatalogEntry[]
  clinicalData: ClinicalDataInput
}

export interface AiSlotGenerationConfig<T> {
  /** Feature's free base model used by gateModel as its fallback. */
  defaultModelId: string
  /** User-picked model id from the feature's prefs store (pre-gating). */
  selectedModelId: string
  /** The persisted auto-run toggle. */
  autoRunEnabled: boolean
  /** true (summary): a MANUAL generate() is also refused while clinical data is
   *  still loading/errored. false (safety): the historical behavior — a manual
   *  scan proceeds regardless. Catalog building and auto-run always wait for
   *  dataReady in both features (a run over partial data would cache a
   *  misleadingly thin result for 12h). */
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
  clinicalData: ClinicalDataInput | null
  catalog: SummarySourceCatalogEntry[]
  result: T | undefined
  isRunning: boolean
  error: string | null
  /** True once this exact patient+audience+model cache slot was restored. */
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

  const { patient } = usePatient()
  // Same data-selection profile as insights — these pipelines are insight-family.
  const { getFullClinicalContext, includedDocumentIds } = useClinicalContext('insights')
  const clinicalData = useClinicalData() as unknown as ClinicalDataInput | null
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  // Auth must be resolved before an auto-run carries a Firebase token —
  // firing before the (possibly anonymous) session resolves would race
  // getProxyIdToken / the auth listener and get rejected.
  const { loading: authLoading, user, isAnonymous } = useAuth()
  const { apiKey, geminiKey, claudeKey } = useAllApiKeys()
  const { audience } = useAudience()

  const patientId = patient?.id ?? ''

  // The model actually used — test seam → user pick (key-gated → free base) →
  // default. A stranded premium pick falls back to the free base. It's part of
  // the slot key, so every model keeps its OWN result / loading / error slot:
  // switching model just changes which slot the view reads, and an in-flight
  // generation keeps running and lands in its own model's slot.
  const resolvedModelId = useMemo(() => {
    const override = resolveModelOverride?.()
    if (typeof override === 'string' && override) return override
    const def = getModelDefinition(selectedModelId)
    const hasProviderKey = def
      ? def.provider === 'openai' ? !!apiKey : def.provider === 'gemini' ? !!geminiKey : !!claudeKey
      : false
    return gateModel(selectedModelId, hasProviderKey, defaultModelId)
  }, [resolveModelOverride, selectedModelId, apiKey, geminiKey, claudeKey, defaultModelId])

  // Cache scope = patient + audience + model: the medical and patient outputs
  // differ, and each model generates independently; switching audience/model
  // swaps to the matching slot (or generates it).
  const slotKey = patientId ? `${patientId}::${audience}::${resolvedModelId}` : ''

  const selectedModelProvider = getModelDefinition(selectedModelId)?.provider
  const hasSelectedProviderKey =
    selectedModelProvider === 'openai' ? !!apiKey :
    selectedModelProvider === 'gemini' ? !!geminiKey :
    selectedModelProvider === 'claude' ? !!claudeKey : false
  // A failed anonymous auto-run must become eligible again after login (or
  // after the user adds their own provider key). The result cache remains
  // patient+audience+model scoped; only the once-per-access-context trigger
  // guard needs this extra identity.
  const accessScope = hasSelectedProviderKey ? 'own-key' : user ? `user:${user.uid}` : isAnonymous ? 'anonymous' : 'no-session'
  const autoRunIdentity = slotKey ? `${slotKey}::${accessScope}` : ''

  const result = store((s) => (slotKey ? s.byKey[slotKey] : undefined))
  const setResult = store((s) => s.setResult)
  const isRunning = store((s) => (slotKey ? !!s.running[slotKey] : false))
  const error = store((s) => (slotKey ? s.errors[slotKey] ?? null : null))

  // Never build a catalog from (or auto-run against) a bundle that is still
  // loading or errored — a run over partial data would cache a misleadingly
  // thin result for 12h.
  const dataReady = !!clinicalData && !clinicalData.isLoading && !clinicalData.error

  // Deterministic citable-record catalog — fed to the prompt so replies can
  // cite keys, and returned so the feature can resolve those keys into
  // click-to-navigate citations. Recomputes only when the bundle changes.
  const catalog = useMemo(
    () => (dataReady && clinicalData
      ? scopeDocumentSources(getSourceCatalog(clinicalData), includedDocumentIds)
      : []),
    [dataReady, clinicalData, includedDocumentIds],
  )

  // Guests auto-run too (v0.25.x): the onboarding step is an explicit opt-in
  // (with a PHI-upload note), the result is cached 12h per patient, and their
  // 50/day free quota is still enforced server-side.
  const generate = useCallback(async () => {
    if (!slotKey) return
    if (requireDataReadyToGenerate && !dataReady) return
    await runGenerationJob({
      store,
      key: slotKey,
      cacheKey: cacheKeyFor(slotKey),
      produce: () =>
        run({
          getFullClinicalContext,
          clinicalData,
          catalog,
          locale,
          audience,
          ai,
          modelId: resolvedModelId,
        }),
    })
  }, [slotKey, requireDataReadyToGenerate, dataReady, store, cacheKeyFor, run, getFullClinicalContext, clinicalData, catalog, locale, audience, ai, resolvedModelId])

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
    const begin = () => setBundleTransitionActive(true)
    const settle = () => setBundleTransitionActive(false)
    window.addEventListener(BUNDLE_CHANGED_EVENT, begin)
    window.addEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    return () => {
      window.removeEventListener(BUNDLE_CHANGED_EVENT, begin)
      window.removeEventListener(BUNDLE_CHANGE_SETTLED_EVENT, settle)
    }
  }, [])
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
    if (!clinicalData) return
    const seeded = demoSeed({ audience, catalog, clinicalData })
    if (!seeded) return
    autoTriggeredRef.current = autoRunIdentity
    setResult(slotKey, seeded)
  }, [demoSeed, slotKey, autoRunIdentity, result, hydrated, patientId, locale, catalog, audience, clinicalData, setResult])

  // Auto-run once per patient+audience+model+access-context after hydration; a
  // failed attempt is NOT retried in a loop — the user regenerates manually.
  // The toggle is explicit authorization for every available selected model,
  // not only the Lite/base model: availability/key fallback has already been
  // applied in resolvedModelId.
  useEffect(() => {
    if (!shouldAutoRunSummarySlot({
      enabled: autoRunEnabled && !bundleTransitionActive && !demoSnapshotExpected,
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
  }, [autoRunEnabled, bundleTransitionActive, demoSnapshotExpected, authLoading, slotKey, autoRunIdentity, isRunning, result, dataReady, hydrated, generate])

  return {
    patientId,
    hasPatient: !!patientId,
    dataReady,
    slotKey,
    resolvedModelId,
    clinicalData,
    catalog,
    result,
    isRunning,
    error,
    isHydrated: !slotKey || hydrated === slotKey,
    generate,
  }
}
