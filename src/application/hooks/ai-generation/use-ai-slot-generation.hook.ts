// Shared engine for the patient-scoped structured-AI pipelines (medical
// summary + safety alerts). One hook owns everything the two features had in
// duplicate: model resolution (user pick → provider-key gating → free base
// fallback, part of the slot key so every model keeps its OWN result /
// loading / error slot), model-version restoration with last-result fallback
// while an empty picker slot waits for its first run, the content-bound
// patient/audience/locale/model slot,
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
import {
  loadEncryptedCache,
  removeEncryptedCache,
  saveEncryptedCache,
} from '@/src/infrastructure/cache/encrypted-session-cache'
import { getModelDefinition, gateModelForKeys } from '@/src/shared/constants/ai-models.constants'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { DEMO_PATIENT_ID } from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  BUNDLE_CHANGED_EVENT,
  BUNDLE_CHANGE_SETTLED_EVENT,
} from '@/src/shared/utils/reset-on-bundle-change'
import { shouldAutoRunSummarySlot, shouldSeedDemoSlot } from './auto-run-policy'
import { runGenerationJob } from './run-generation-job'
import type {
  AiGenerationIssue,
  AiResultStore,
} from './create-ai-result-store'
import {
  useClinicalAiInput,
  type ClinicalAiDataInput,
} from './use-clinical-ai-input.hook'
import { patientAiSlotKey } from './ai-slot-key'
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import {
  modelContextLimit,
  modelDisplayLabel,
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
  /** Immutable user-facing name of the model that actually ran. */
  modelName: string
  /** Exact result slot that owns this request and its AbortController. */
  operationKey: string
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
  /** Read immutable provenance from a result. When supplied, a legacy result
   *  filed under the wrong model slot is presentation fallback only; it never
   *  masquerades as the selected model's own saved version. */
  resultModelId?: (result: T) => string | undefined
  /** Keep the last result for the same patient/content visible while the user
   *  changes the model that will be used by the next explicit generation.
   *  The selected model's own completed slot always wins when it exists. The
   *  retained result is presentation-only while that target slot is empty or
   *  its encrypted cache is still being restored. */
  retainResultOnModelChange?: boolean
}

export interface AiSlotGenerationReturn<T> {
  patientId: string
  hasPatient: boolean
  dataReady: boolean
  /** Model-independent identity for the current Bundle/patient/audience/
   *  locale/exact clinical input. Use this for UI lifecycles that span more
   *  than one model slot. */
  scopeKey: string
  slotKey: string
  resolvedModelId: string
  resolvedModelName: string
  clinicalData: ClinicalAiDataInput | null
  catalog: SummarySourceCatalogEntry[]
  result: T | undefined
  /** Immutable logical model id that owns the result currently being shown.
   * It may differ from resolvedModelId while an empty selected slot uses the
   * last visible model as presentation fallback. */
  resultOwnerModelId: string | null
  /** Exact non-secret runtime/cache identity that owns the visible result.
   * For a custom endpoint this distinguishes endpoint + upstream-model
   * versions even though their logical picker id is always custom-openai. */
  resultOwnerRuntimeId: string | null
  isRunning: boolean
  /** Any in-flight model slot in this exact scope. This remains true if the
   * picker moves away from the running model, but becomes false when the user
   * moves to another audience, locale, patient, Bundle revision, or selected
   * clinical input. */
  isAnyRunning: boolean
  error: string | null
  issue: AiGenerationIssue | null
  contextLimit: number
  /** True once this exact cache slot was restored, or when an opted-in feature
   *  can keep a completed result for the same clinical input visible. */
  isHydrated: boolean
  generate: () => Promise<void>
  /** Abort every request owned by this pipeline and invalidate any late reply. */
  cancel: (slotKey?: string) => void
  /** Restore the exact result/cache slot captured before a coordinated batch.
   * Used when its companion pipeline is stopped after this one already
   * completed, so reloads cannot resurrect half of a cancelled batch. */
  restoreSlot: (slotKey: string, result: T | undefined) => void
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
    resultModelId,
    retainResultOnModelChange = false,
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
  const {
    apiKey,
    geminiKey,
    claudeKey,
    openAiCompatibleProfiles,
  } = useAllApiKeys()
  const { audience } = useAudience()

  // The model actually used — test seam → user pick (key-gated → free base) →
  // default. A stranded premium pick falls back to the free base. It's part of
  // the slot key, so every model keeps its OWN result / loading / error slot,
  // and an in-flight generation keeps running and lands in its own model's
  // slot. Features may retain the last result as a presentation fallback while
  // the newly selected model waits for an explicit run.
  const selectedOpenAiCompatible = useMemo(
    () => resolveOpenAiCompatibleProfile(selectedModelId, openAiCompatibleProfiles),
    [selectedModelId, openAiCompatibleProfiles],
  )
  const resolvedModelId = useMemo(() => {
    const override = resolveModelOverride?.()
    if (typeof override === 'string' && override) return override
    return gateModelForKeys(
      selectedModelId,
      {
        openAiKey: apiKey,
        geminiKey,
        claudeKey,
        customAvailable: isOpenAiCompatibleRuntimeReady(selectedOpenAiCompatible),
      },
      defaultModelId,
    )
  }, [resolveModelOverride, selectedModelId, apiKey, geminiKey, claudeKey, selectedOpenAiCompatible, defaultModelId])

  const openAiCompatible = useMemo(
    () => resolveOpenAiCompatibleProfile(resolvedModelId, openAiCompatibleProfiles),
    [resolvedModelId, openAiCompatibleProfiles],
  )

  const runtimeModelId = useMemo(
    () => modelRuntimeIdentity(resolvedModelId, openAiCompatible),
    [resolvedModelId, openAiCompatible],
  )
  const resolvedModelName = useMemo(
    () => modelDisplayLabel(resolvedModelId, openAiCompatible),
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
  const selectedModelReady = selectedModelProvider !== 'custom' ||
    isOpenAiCompatibleRuntimeReady(selectedOpenAiCompatible)
  // A failed anonymous auto-run must become eligible again after login (or
  // after the user adds a provider connection). This identity deliberately
  // describes all available access, not the selected model: moving the picker
  // between providers must never look like fresh auto-run authorization.
  const accessScope = [
    user ? `user:${user.uid}` : isAnonymous ? 'anonymous' : 'no-session',
    apiKey ? 'openai' : '',
    geminiKey ? 'gemini' : '',
    claudeKey ? 'claude' : '',
    openAiCompatibleProfiles.some((profile) => (
      isOpenAiCompatibleRuntimeReady(profile)
    )) ? 'custom' : '',
  ].join('|')
  const bundleRevision = store((s) => s.bundleRevision)

  // UI orchestration spans all model slots for one exact clinical-input
  // scope. Keep the Bundle revision in the identity even though it is not in
  // the persisted slot key: importing a different Bundle with the same
  // patient id/content must still invalidate an in-flight visible batch.
  const resultScope = slotKey
    ? [bundleRevision, patientId, audience, locale, inputSignature].join('::')
    : ''
  // The frozen zh-TW demo has a bundled result even when a model preference
  // from real data is still selected. Treat it as a presentation fallback,
  // but never file it as that unrelated model's own generated version.
  const demoSnapshotExpected =
    Boolean(demoSeed) &&
    patientId === DEMO_PATIENT_ID &&
    locale === 'zh-TW'
  const allowResultRetention = retainResultOnModelChange || demoSnapshotExpected
  // Auto-run is a consented action for one clinical-input scope, not a model
  // picker side effect. After that scope has attempted once, changing the
  // picker only selects the next explicit generation; it must not launch a
  // second concurrent request against another model.
  const autoRunIdentity = resultScope
    ? `${resultScope}::${accessScope}`
    : ''
  const scopeSlotPrefix = slotKey
    ? [patientId, audience, locale].join('::') + '::'
    : ''
  const scopeSlotSuffix = slotKey ? `::ctx-${inputSignature}` : ''
  const cancellationEpochsRef = useRef<Map<string, number>>(new Map())
  const autoTriggeredRef = useRef<string | null>(null)

  const exactResult = store((s) => (slotKey ? s.byKey[slotKey] : undefined))
  const setResult = store((s) => s.setResult)
  const isRunning = store((s) => (slotKey ? !!s.running[slotKey] : false))
  const isAnyRunning = store((s) => Boolean(scopeSlotPrefix) && Object.entries(s.running).some(
    ([key, running]) => running && key.startsWith(scopeSlotPrefix) && key.endsWith(scopeSlotSuffix),
  ))
  const error = store((s) => (slotKey ? s.errors[slotKey] ?? null : null))
  const issue = store((s) => (slotKey ? s.issues[slotKey] ?? null : null))

  const declaredExactResultModelId = exactResult === undefined
    ? null
    : resultModelId?.(exactResult) || null
  const exactResultOwnerModelId = exactResult === undefined
    ? null
    : declaredExactResultModelId || (
        demoSnapshotExpected && resolvedModelId !== defaultModelId
          // Released builds predated generation provenance and could file the
          // bundled Flash-Lite snapshot in any selected demo slot. On the demo
          // patient, an unlabelled non-default result is therefore fallback,
          // never proof that the selected model actually generated it.
          ? defaultModelId
          : resolvedModelId
      )
  const exactResultBelongsToSelectedModel = exactResult !== undefined &&
    exactResultOwnerModelId === resolvedModelId
  const exactResultOwnerRuntimeId = exactResult === undefined
    ? null
    : exactResultBelongsToSelectedModel
      ? runtimeModelId
      : exactResultOwnerModelId

  // A picker is both the model for the NEXT run and a version selector for
  // completed results. Prefer the selected model's exact slot whenever it has
  // a valid result; otherwise keep the last visible result while an empty slot
  // waits for an explicit run (or a delayed encrypted-cache read). Scope
  // includes the Bundle epoch so fallback can never cross patient/input data.
  const [retainedResultState, setRetainedResultState] = useState<{
    scope: string
    modelId: string
    runtimeId: string
    result: T
  } | null>(null)
  useEffect(() => {
    // This state intentionally mirrors the last completed slot so it remains
    // renderable after selectedModelId points at a different, empty slot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetainedResultState((current) => {
      if (!allowResultRetention || !resultScope) return null
      if (exactResultBelongsToSelectedModel) {
        if (
          current?.scope === resultScope &&
          current.modelId === resolvedModelId &&
          current.runtimeId === runtimeModelId &&
          Object.is(current.result, exactResult)
        ) {
          return current
        }
        return {
          scope: resultScope,
          modelId: resolvedModelId,
          runtimeId: runtimeModelId,
          result: exactResult,
        }
      }
      if (current?.scope === resultScope) return current
      // Legacy builds could seed the Flash-Lite demo snapshot into whichever
      // model happened to be selected. With no current result it is still a
      // useful fallback, but its immutable provenance remains Flash-Lite.
      if (exactResult !== undefined && exactResultOwnerModelId) {
        return {
          scope: resultScope,
          modelId: exactResultOwnerModelId,
          runtimeId: exactResultOwnerRuntimeId ?? exactResultOwnerModelId,
          result: exactResult,
        }
      }
      return null
    })
  }, [
    allowResultRetention,
    exactResult,
    exactResultBelongsToSelectedModel,
    exactResultOwnerModelId,
    exactResultOwnerRuntimeId,
    resolvedModelId,
    resultScope,
    runtimeModelId,
  ])
  const retainedResult = allowResultRetention && retainedResultState?.scope === resultScope
    ? retainedResultState
    : null
  const result = exactResultBelongsToSelectedModel
    ? exactResult
    : retainedResult?.result ?? exactResult
  const resultOwnerModelId = result === undefined
    ? null
    : exactResultBelongsToSelectedModel
      ? resolvedModelId
      : retainedResult?.modelId ?? exactResultOwnerModelId
  const resultOwnerRuntimeId = result === undefined
    ? null
    : exactResultBelongsToSelectedModel
      ? runtimeModelId
      : retainedResult?.runtimeId ?? exactResultOwnerRuntimeId

  // Editing a custom endpoint's declared context window changes whether the
  // exact same prompt fits, even though endpoint/model cache identity stays the
  // same. Release the deterministic blocked state so Generate can re-evaluate
  // against the new verified value.
  useEffect(() => {
    if (!slotKey || !issue || issue.limit === resolvedContextLimit) return
    store.getState().setIssue(slotKey, null)
    store.getState().setError(slotKey, null)
  }, [issue, resolvedContextLimit, slotKey, store])

  // Guests auto-run too (v0.25.x): callers apply the source-aware real-data
  // consent gate, results are cached 12h per patient, and the 50/day free quota
  // is still enforced server-side.
  const generate = useCallback(async () => {
    if (!slotKey) return
    if (requireDataReadyToGenerate && !dataReady) return
    const cancellationEpoch = cancellationEpochsRef.current.get(slotKey) ?? 0
    const generatedResult = await runGenerationJob({
      store,
      key: slotKey,
      cacheKey: cacheKeyFor(slotKey),
      shouldCommit: () => (
        (cancellationEpochsRef.current.get(slotKey) ?? 0) === cancellationEpoch
      ),
      produce: () =>
        run({
          clinicalContext,
          clinicalData: scopedClinicalData,
          catalog,
          locale,
          audience,
          ai,
          modelId: resolvedModelId,
          modelName: resolvedModelName,
          operationKey: slotKey,
          contextLimit: resolvedContextLimit,
        }),
    })
    if (
      allowResultRetention &&
      resultScope &&
      generatedResult !== null
    ) {
      setRetainedResultState({
        scope: resultScope,
        modelId: resolvedModelId,
        runtimeId: runtimeModelId,
        result: generatedResult,
      })
    }
  }, [slotKey, requireDataReadyToGenerate, dataReady, store, cacheKeyFor, run, clinicalContext, scopedClinicalData, catalog, locale, audience, ai, resolvedModelId, resolvedModelName, resolvedContextLimit, allowResultRetention, resultScope, runtimeModelId])

  const cancel = useCallback((targetSlotKey: string = slotKey) => {
    // Invalidate first: a provider may resolve with buffered text before its
    // AbortSignal rejection reaches us. The generation job checks this epoch
    // before committing either a result or an error.
    if (targetSlotKey) {
      const currentEpoch = cancellationEpochsRef.current.get(targetSlotKey) ?? 0
      cancellationEpochsRef.current.set(targetSlotKey, currentEpoch + 1)
    }
    // If this pipeline was still waiting for hydration as one half of an
    // automatic summary batch, stopping the batch must prevent that delayed
    // half from starting afterwards.
    if (autoRunIdentity) autoTriggeredRef.current = autoRunIdentity
    stopAi(targetSlotKey || undefined)
  }, [autoRunIdentity, slotKey, stopAi])

  const restoreSlot = useCallback((targetSlotKey: string, previousResult: T | undefined) => {
    const state = store.getState()
    const bundleRevision = state.bundleRevision
    const targetCacheKey = cacheKeyFor(targetSlotKey)
    state.setError(targetSlotKey, null)
    state.setIssue(targetSlotKey, null)
    // Remove a possibly completed half-batch synchronously first. If
    // re-encrypting the previous result later fails, a reload should show no
    // result rather than resurrect the cancelled newer half.
    removeEncryptedCache(targetCacheKey)
    if (previousResult === undefined) {
      state.clear(targetSlotKey)
      return
    }
    state.setResult(targetSlotKey, previousResult)
    void saveEncryptedCache(
      targetCacheKey,
      previousResult,
      () => {
        const latest = store.getState()
        return latest.bundleRevision === bundleRevision &&
          latest.byKey[targetSlotKey] === previousResult
      },
    )
  }, [cacheKeyFor, store])

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
      // A retained prior-model result keeps the screen interactive while this
      // read runs. Never let a slow cache read overwrite a newer manual run
      // that may have completed in the meantime.
      if (cached && !store.getState().byKey[slotKey]) {
        store.getState().setResult(slotKey, cached)
      }
      setHydrated(slotKey)
    })()
    return () => { cancelled = true }
  }, [slotKey, store, loadCached, cacheKeyFor, cacheMaxAgeMs])

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
  // Demo bundle: seed the pre-generated snapshot instead of burning an AI call
  // on data whose answer is a constant. It belongs to the feature's canonical
  // default model. With another model selected it may fill an otherwise blank
  // screen as presentation fallback, but MUST NOT be written into that model's
  // slot. Selecting the canonical model seeds its own slot after hydration, so
  // switching back later restores the audited snapshot. Declared before the
  // auto-run effect and marks autoTriggeredRef first so the same commit cannot
  // also fire a live generation.
  useEffect(() => {
    if (!demoSeed) return
    const selectedOwnsSnapshot = resolvedModelId === defaultModelId
    const hasRetainedPresentation = retainedResultState?.scope === resultScope
    if (!shouldSeedDemoSlot({
      hasDemoSeed: true,
      slotKey,
      hasResult: Boolean(exactResult) || (!selectedOwnsSnapshot && hasRetainedPresentation),
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
    if (selectedOwnsSnapshot) {
      setResult(slotKey, seeded)
      return
    }
    // The snapshot is presentation-only for a retained non-default picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetainedResultState({
      scope: resultScope,
      modelId: defaultModelId,
      runtimeId: defaultModelId,
      result: seeded,
    })
  }, [
    audience,
    autoRunIdentity,
    catalog,
    defaultModelId,
    demoSeed,
    exactResult,
    hydrated,
    locale,
    patientId,
    resolvedModelId,
    resultScope,
    retainedResultState,
    scopedClinicalData,
    setResult,
    slotKey,
  ])

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
      busy: isAnyRunning,
      dataReady,
      hasResult: Boolean(result),
      hydratedSlotKey: hydrated,
      autoRunIdentity,
      triggeredIdentity: autoTriggeredRef.current,
    })) return
    autoTriggeredRef.current = autoRunIdentity
    void generate()
  }, [autoRunEnabled, selectedModelReady, bundleTransitionActive, demoSnapshotExpected, authLoading, slotKey, autoRunIdentity, isAnyRunning, result, dataReady, hydrated, generate])

  return {
    patientId,
    hasPatient: !!patientId,
    dataReady,
    scopeKey: resultScope,
    slotKey,
    resolvedModelId,
    resolvedModelName,
    clinicalData: scopedClinicalData,
    catalog,
    result,
    resultOwnerModelId,
    resultOwnerRuntimeId,
    isRunning,
    isAnyRunning,
    error,
    issue,
    contextLimit: resolvedContextLimit,
    isHydrated: !slotKey || hydrated === slotKey || retainedResult !== null,
    generate,
    cancel,
    restoreSlot,
  }
}
