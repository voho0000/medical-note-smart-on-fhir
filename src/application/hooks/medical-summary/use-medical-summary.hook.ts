// Medical Summary hook — thin adapter over the shared AI slot-generation
// engine (src/application/hooks/ai-generation/): runs the structured
// generation on the selected summary model, verifies citations against the
// bundle, and caches per patient/audience/locale/model/exact clinical input so
// tab switches / reloads don't re-bill or restore a result for stale data.
//
// Auto-generate policy: when enabled, an initially empty clinical-input scope
// runs once after cache/auth hydration. Changing the picker restores that
// model's completed version when available; otherwise the current version
// remains visible until an explicit regeneration succeeds.
'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useAudience } from '@/src/application/providers/audience.provider'
import {
  ContextOverflowError,
  createContextOverflowIssue,
  type ContextOverflowIssue,
} from '@/src/shared/utils/context-budget'
import {
  loadEncryptedCache,
  saveEncryptedCache,
  aiResultCacheKey,
} from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  generateMedicalSummaryUseCase,
  buildCoverageStats,
  buildLongitudinalInvestigationContext,
  MEDICAL_SUMMARY_MODEL_ID,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type {
  MedicalSummaryModuleErrors,
  MedicalSummaryModuleId,
  MedicalSummaryResult,
  SummaryCoverageStats,
} from '@/src/core/entities/medical-summary.entity'
import { MEDICAL_SUMMARY_MODULE_IDS } from '@/src/core/entities/medical-summary.entity'
import {
  DEMO_MEDICAL_SUMMARY_GENERATION,
  demoMedicalSummarySnapshots,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  medicalSummaryStore,
  summaryCacheKey,
  SUMMARY_CACHE_MAX_AGE_MS,
} from './medical-summary-store'
import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import {
  useAiSlotGeneration,
  type AiSlotDemoContext,
  type AiSlotRunContext,
} from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'
import {
  isAutoAiEnabledForSource,
  useAutoAiConsentState,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'
import { getUserErrorMessage } from '@/src/core/errors'
import { isCustomOpenAiModelId } from '@/src/shared/constants/ai-models.constants'
import { useAiDemographicsGate } from '@/src/application/providers/ai-demographics-gate.provider'

// Store + cache-key scheme live in medical-summary-store.ts so the IPS export
// can peek at generated summaries without importing this full hook graph.
// v13 modularizes live card generation for both audiences. Patient summaries
// from v11/v10/v9/v8/v7/v6/v5 remain valid legacy fallbacks; v12 live results
// intentionally regenerate into the module-aware cache shape.
const legacyPatientSummaryCacheKeys = (scanKey: string) => [
  aiResultCacheKey('medsummary11', scanKey),
  aiResultCacheKey('medsummary10', scanKey),
  aiResultCacheKey('medsummary9', scanKey),
  aiResultCacheKey('medsummary8', scanKey),
  aiResultCacheKey('medsummary7', scanKey),
  aiResultCacheKey('medsummary6', scanKey),
  aiResultCacheKey('medsummary5', scanKey),
]

const medicalSummaryResultModelId = (result: MedicalSummaryResult) =>
  result.generation?.modelId

interface SummaryPrefsStore {
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}

export const useSummaryPrefsStore = createModelPrefsStore<SummaryPrefsStore>({
  storageName: 'medical-summary-prefs',
  defaultModelId: MEDICAL_SUMMARY_MODEL_ID,
  initializer: (set) => ({
    // Default OFF. The separate source-aware consent gate also prevents a demo
    // preference from sending a later real patient's data to cloud AI.
    autoGenerate: false,
    setAutoGenerate: (value) => set({ autoGenerate: value }),
    modelId: MEDICAL_SUMMARY_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})

export interface UseMedicalSummaryReturn {
  result: MedicalSummaryResult | undefined
  /** Actual model that owns result; differs from model while an empty selected
   * slot is temporarily showing another model's last complete version. */
  resultOwnerModelId: string | null
  /** Exact endpoint/model cache identity that owns result. */
  resultOwnerRuntimeId: string | null
  coverage: SummaryCoverageStats | null
  isGenerating: boolean
  error: string | null
  issue: ContextOverflowIssue | null
  hasPatient: boolean
  dataReady: boolean
  /** Model-independent Bundle/patient/audience/locale/input identity used by
   *  the summary+safety orchestrator to isolate visible generation batches. */
  scopeKey: string
  /** Exact model/content slot selected for the next generation. */
  generationSlotKey: string
  /** Unlike isGenerating, this identifies whether the currently selected
   * slot itself is running (used to capture auto-run batch ownership). */
  isCurrentSlotGenerating: boolean
  readGenerationSlot: (slotKey: string) => {
    result: MedicalSummaryResult | undefined
    isRunning: boolean
    error: string | null
    issue: ContextOverflowIssue | null
  }
  /** True when this clinical-input scope has a presentable restored result. */
  isHydrated: boolean
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
  model: string
  /** Effective user-facing model name for the next run, captured by the
   * orchestrator when a generation batch begins. */
  resolvedModelName: string
  setModel: (id: string) => void
  recordGenerationCompletion: (input: {
    slotKey: string
    generatedAt: number
    modelId: string
    completedAt: number
    durationMs: number
  }) => void
  generate: () => Promise<void>
  /** Regenerate only modules recorded in result.moduleErrors, preserving
   * successful cards in the same slot. Falls back to a full generation when
   * the selected slot has no partial result. */
  retryFailedModules: () => Promise<void>
  cancel: (slotKey?: string) => void
  restoreGenerationSlot: (slotKey: string, result: MedicalSummaryResult | undefined) => void
}

export function useMedicalSummary(): UseMedicalSummaryReturn {
  const autoGenerate = useSummaryPrefsStore((s) => s.autoGenerate)
  const setAutoGenerate = useSummaryPrefsStore((s) => s.setAutoGenerate)
  const modelId = useSummaryPrefsStore((s) => s.modelId)
  const setModelId = useSummaryPrefsStore((s) => s.setModelId)
  const { audience } = useAudience()
  const { demographicsReadyForAi } = useAiDemographicsGate()
  const autoAiConsent = useAutoAiConsentState()
  const moduleRetryRequestsRef = useRef(new Map<string, {
    moduleIds: MedicalSummaryModuleId[]
    baseResult: MedicalSummaryResult
  }>())

  // v6 first, v5 fallback for patient summaries (see key comments above).
  const loadCached = useCallback(async (slotKey: string) => {
    let cached = await loadEncryptedCache<MedicalSummaryResult>(
      summaryCacheKey(slotKey),
      SUMMARY_CACHE_MAX_AGE_MS,
    )
    if (!cached && audience === 'patient') {
      for (const key of legacyPatientSummaryCacheKeys(slotKey)) {
        cached = await loadEncryptedCache<MedicalSummaryResult>(key, SUMMARY_CACHE_MAX_AGE_MS)
        if (cached) break
      }
    }
    return cached
  }, [audience])

  const run = useCallback(async (ctx: AiSlotRunContext): Promise<MedicalSummaryResult | null> => {
    const outputLocale: 'en' | 'zh-TW' = ctx.locale === 'zh-TW' ? 'zh-TW' : 'en'
    const longitudinalInvestigationContext = ctx.clinicalData
      ? buildLongitudinalInvestigationContext(ctx.clinicalData, ctx.catalog)
      : ''
    const clinicalContext = [ctx.clinicalContext, longitudinalInvestigationContext]
      .filter(Boolean)
      .join('\n\n')
    const retryRequest = moduleRetryRequestsRef.current.get(ctx.operationKey)
    moduleRetryRequestsRef.current.delete(ctx.operationKey)
    const targetModuleIds = retryRequest?.moduleIds ?? [...MEDICAL_SUMMARY_MODULE_IDS]
    const promptInput = {
      clinicalContext,
      piiLiterals: ctx.piiLiterals,
      catalog: ctx.catalog,
      locale: outputLocale,
      audience: ctx.audience === 'patient' ? 'patient' as const : 'medical' as const,
      harnessProfile: isCustomOpenAiModelId(ctx.modelId) ? 'local-small' as const : 'frontier' as const,
    }
    const retryRequests = retryRequest
      ? targetModuleIds.map((moduleId) => ({
          moduleId,
          messages: generateMedicalSummaryUseCase.buildModuleMessages(promptInput, moduleId),
        }))
      : []
    const initialBatchMessages = retryRequest
      ? null
      : generateMedicalSummaryUseCase.buildBatchModuleMessages(promptInput)
    const messageSets = initialBatchMessages
      ? [initialBatchMessages]
      : retryRequests.map(({ messages }) => messages)
    const overflow = messageSets
      .map((messages) => createContextOverflowIssue(
        messages.map((message) => message.content).join('\n\n'),
        ctx.modelId,
        {
          selectedContext: ctx.clinicalContext,
          contextLimit: ctx.contextLimit,
        },
      ))
      .filter((issue): issue is ContextOverflowIssue => issue !== null)
      .sort((left, right) => right.overBy - left.overBy)[0] ?? null
    if (overflow) {
      throw new ContextOverflowError(overflow, ctx.locale)
    }

    const runModule = async ({
      moduleId,
      messages,
    }: typeof retryRequests[number]) => {
      const full = await ctx.ai.stream(messages, {
        modelId: ctx.modelId,
        operationKey: ctx.operationKey,
        throwOnAbort: true,
        // Structured JSON is more reliable on OpenAI-compatible local models
        // when sampling is deterministic. Providers that require/omit a fixed
        // temperature normalize this option in their adapter.
        temperature: 0,
        ...(isCustomOpenAiModelId(ctx.modelId) ? { reasoningEffort: 'low' as const } : {}),
      })
      const parsed = generateMedicalSummaryUseCase.parseModuleResult(moduleId, full)
      if (!parsed) {
        return { moduleId, error: 'PARSE_FAILED' as const }
      }
      const unknownSourceKeys = generateMedicalSummaryUseCase.findUnknownSourceKeys(
        parsed,
        ctx.catalog,
      )
      if (unknownSourceKeys.length > 0) {
        console.warn(
          `[medical-summary:${moduleId}] grounding validation failed; unknown source keys:`,
          unknownSourceKeys,
        )
        return { moduleId, error: 'GROUNDING_FAILED' as const }
      }
      return { moduleId, result: parsed }
    }

    // Initial generation sends the large clinical context once, then validates
    // each delimited card independently. Retry requests remain one call per
    // failed card so successful content is neither re-billed nor replaced.
    const settled: Array<PromiseSettledResult<Awaited<ReturnType<typeof runModule>>>> = []
    if (initialBatchMessages) {
      try {
        const full = await ctx.ai.stream(initialBatchMessages, {
          modelId: ctx.modelId,
          operationKey: ctx.operationKey,
          throwOnAbort: true,
          temperature: 0,
          ...(isCustomOpenAiModelId(ctx.modelId) ? { reasoningEffort: 'low' as const } : {}),
        })
        targetModuleIds.forEach((moduleId) => {
          const parsed = generateMedicalSummaryUseCase.parseBatchModuleResult(moduleId, full)
          const unknownSourceKeys = parsed
            ? generateMedicalSummaryUseCase.findUnknownSourceKeys(parsed, ctx.catalog)
            : []
          if (unknownSourceKeys.length > 0) {
            console.warn(
              `[medical-summary:${moduleId}] grounding validation failed; unknown source keys:`,
              unknownSourceKeys,
            )
          }
          settled.push({
            status: 'fulfilled',
            value: parsed && unknownSourceKeys.length === 0
              ? { moduleId, result: parsed }
              : {
                  moduleId,
                  error: parsed ? 'GROUNDING_FAILED' as const : 'PARSE_FAILED' as const,
                },
          })
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        targetModuleIds.forEach(() => {
          settled.push({ status: 'rejected', reason: error })
        })
      }
    } else if (isCustomOpenAiModelId(ctx.modelId)) {
      // A user-configured local endpoint remains sequential so a small
      // on-prem model is not unexpectedly hit with several retries at once.
      for (const request of retryRequests) {
        try {
          settled.push({ status: 'fulfilled', value: await runModule(request) })
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          settled.push({ status: 'rejected', reason: error })
        }
      }
    } else {
      settled.push(...await Promise.allSettled(retryRequests.map(runModule)))
    }

    // Local Chat Completions endpoints are stateless, so permanently splitting
    // every summary into multiple calls would resend the entire patient context
    // and nearly double input tokens. Prefer one batch, then retry only cards
    // whose independently delimited JSON failed to parse or cited a nonexistent
    // catalog key. Cap automatic retries
    // at two so a badly failed batch cannot fan out into five full-context calls.
    // If the whole request failed, preserve the previous medication-only fallback
    // instead of resending every card.
    if (initialBatchMessages && isCustomOpenAiModelId(ctx.modelId)) {
      const allRejected = settled.length > 0 && settled.every((outcome) => outcome.status === 'rejected')
      const parseFailedModuleIds = targetModuleIds.filter((moduleId, index) => {
        const outcome = settled[index]
        return outcome?.status === 'fulfilled' && 'error' in outcome.value
      })
      const retryModuleIds = allRejected && targetModuleIds.includes('medications')
        ? ['medications' as const]
        : [...parseFailedModuleIds]
            .sort((left, right) => Number(right === 'medications') - Number(left === 'medications'))
            .slice(0, 2)

      for (const moduleId of retryModuleIds) {
        const moduleIndex = targetModuleIds.indexOf(moduleId)
        const moduleRequest = {
          moduleId,
          messages: generateMedicalSummaryUseCase.buildModuleMessages(promptInput, moduleId),
        }
        try {
          settled[moduleIndex] = {
            status: 'fulfilled',
            value: await runModule(moduleRequest),
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          settled[moduleIndex] = { status: 'rejected', reason: error }
        }
      }
    }

    const aborted = settled.find((outcome) =>
      outcome.status === 'rejected' &&
      outcome.reason instanceof Error &&
      outcome.reason.name === 'AbortError',
    )
    if (aborted?.status === 'rejected') throw aborted.reason

    let draft = generateMedicalSummaryUseCase.createAiDraftFromResult(retryRequest?.baseResult)
    const moduleErrors: MedicalSummaryModuleErrors = {
      ...(retryRequest?.baseResult.moduleErrors ?? {}),
    }
    settled.forEach((outcome, index) => {
      const moduleId = targetModuleIds[index]
      if (outcome.status === 'rejected') {
        moduleErrors[moduleId] = getUserErrorMessage(outcome.reason)
        return
      }
      if ('error' in outcome.value) {
        moduleErrors[moduleId] = outcome.value.error
        return
      }
      draft = generateMedicalSummaryUseCase.mergeModuleResult(
        draft,
        moduleId,
        outcome.value.result,
      )
      delete moduleErrors[moduleId]
    })

    const finalized = generateMedicalSummaryUseCase.finalizeResult(draft, ctx.catalog, {
      clinicalData: ctx.clinicalData ?? undefined,
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      locale: outputLocale,
      strictGrounding: isCustomOpenAiModelId(ctx.modelId),
    })
    const generatedAt = Date.now()
    return {
      ...finalized,
      moduleErrors: Object.keys(moduleErrors).length > 0 ? moduleErrors : undefined,
      generation: {
        source: 'live',
        // This is the resolved model that actually ran, not the raw picker
        // preference (which may have fallen back because a key was missing).
        modelId: ctx.modelId,
        modelName: ctx.modelName,
        generatedAt,
      },
    }
  }, [])

  // Demo bundle: runs through the SAME parse → finalize pipeline as a live
  // reply, so citations verify against the real catalog.
  const demoSeed = useCallback((ctx: AiSlotDemoContext): MedicalSummaryResult | null => {
    const snapshot = demoMedicalSummarySnapshots[ctx.audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
    if (!parsed) return null
    const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData,
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      locale: 'zh-TW',
    })
    return {
      ...finalized,
      generation: DEMO_MEDICAL_SUMMARY_GENERATION,
    }
  }, [])

  const slot = useAiSlotGeneration<MedicalSummaryResult>({
    defaultModelId: MEDICAL_SUMMARY_MODEL_ID,
    selectedModelId: modelId,
    // A demo-first visit must never authorize a later real patient's data.
    // Manual generation remains available; only background cloud runs are gated.
    autoRunEnabled:
      demographicsReadyForAi &&
      isAutoAiEnabledForSource(autoGenerate, autoAiConsent),
    // Even a MANUAL generate waits for the full clinical dataset.
    requireDataReadyToGenerate: true,
    store: medicalSummaryStore,
    cacheKeyFor: summaryCacheKey,
    cacheMaxAgeMs: SUMMARY_CACHE_MAX_AGE_MS,
    loadCached,
    run,
    demoSeed,
    resultModelId: medicalSummaryResultModelId,
    retainResultOnModelChange: true,
  })

  // Deterministic coverage stats for the coverage card — recomputes only when
  // the bundle changes.
  const coverage = useMemo(
    () => (slot.dataReady && slot.clinicalData ? buildCoverageStats(slot.clinicalData) : null),
    [slot.dataReady, slot.clinicalData],
  )

  // The picker restores that model's latest completed summary when available.
  // If its slot is empty, the shared hook keeps the last visible summary until
  // this model succeeds; in-flight work still lands in the slot that owns it.
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  const generationSlotKey = slot.slotKey
  const runSlotGeneration = slot.generate
  const generate = useCallback(async () => {
    moduleRetryRequestsRef.current.delete(generationSlotKey)
    await runSlotGeneration()
  }, [generationSlotKey, runSlotGeneration])

  const retryFailedModules = useCallback(async () => {
    const exactResult = medicalSummaryStore.getState().byKey[generationSlotKey]
    const moduleIds = MEDICAL_SUMMARY_MODULE_IDS.filter(
      (moduleId) => Boolean(exactResult?.moduleErrors?.[moduleId]),
    )
    if (!exactResult || moduleIds.length === 0) {
      await generate()
      return
    }
    const request = {
      moduleIds,
      baseResult: exactResult,
    }
    moduleRetryRequestsRef.current.set(generationSlotKey, request)
    try {
      await runSlotGeneration()
    } finally {
      if (moduleRetryRequestsRef.current.get(generationSlotKey) === request) {
        moduleRetryRequestsRef.current.delete(generationSlotKey)
      }
    }
  }, [generate, generationSlotKey, runSlotGeneration])

  const readGenerationSlot = useCallback((slotKey: string) => {
    const state = medicalSummaryStore.getState()
    return {
      result: state.byKey[slotKey],
      isRunning: Boolean(state.running[slotKey]),
      error: state.errors[slotKey] ?? null,
      issue: state.issues[slotKey] ?? null,
    }
  }, [])

  // The orchestrator owns the user-visible batch (summary + safety scan), so
  // completion metadata is attached only after every pipeline that belongs to
  // that batch succeeds. The exact captured slot remains correct even if the
  // user changes the model picker while the request is running.
  const recordGenerationCompletion = useCallback(({
    slotKey,
    generatedAt,
    modelId,
    completedAt,
    durationMs,
  }: {
    slotKey: string
    generatedAt: number
    modelId: string
    completedAt: number
    durationMs: number
  }) => {
    if (!Number.isFinite(generatedAt) || !Number.isFinite(durationMs) || durationMs < 0) return
    if (!Number.isFinite(completedAt) || completedAt < generatedAt) return
    const state = medicalSummaryStore.getState()
    const bundleRevision = state.bundleRevision
    const current = state.byKey[slotKey]
    if (
      current?.generation?.source !== 'live' ||
      current.generation.generatedAt !== generatedAt ||
      current.generation.modelId !== modelId
    ) return
    const next: MedicalSummaryResult = {
      ...current,
      generation: {
        ...current.generation,
        completedAt,
        durationMs: Math.round(durationMs),
      },
    }
    state.setResult(slotKey, next)
    void saveEncryptedCache(summaryCacheKey(slotKey), next, () => {
      const latest = medicalSummaryStore.getState()
      return latest.bundleRevision === bundleRevision && latest.byKey[slotKey] === next
    })
  }, [])

  return {
    result: slot.result,
    resultOwnerModelId: slot.resultOwnerModelId,
    resultOwnerRuntimeId: slot.resultOwnerRuntimeId,
    coverage,
    isGenerating: slot.isAnyRunning,
    error: slot.error,
    issue: slot.issue,
    hasPatient: slot.hasPatient,
    dataReady: slot.dataReady,
    scopeKey: slot.scopeKey,
    generationSlotKey: slot.slotKey,
    isCurrentSlotGenerating: slot.isRunning,
    readGenerationSlot,
    isHydrated: slot.isHydrated,
    autoGenerate,
    setAutoGenerate,
    model: modelId,
    resolvedModelName: slot.resolvedModelName,
    setModel,
    recordGenerationCompletion,
    generate,
    retryFailedModules,
    cancel: slot.cancel,
    restoreGenerationSlot: slot.restoreSlot,
  }
}
