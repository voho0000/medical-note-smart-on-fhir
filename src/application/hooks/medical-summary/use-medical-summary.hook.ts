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

import { useCallback, useMemo } from 'react'
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
  MedicalSummaryResult,
  SummaryCoverageStats,
} from '@/src/core/entities/medical-summary.entity'
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

// Store + cache-key scheme live in medical-summary-store.ts so the IPS export
// can peek at generated summaries without importing this full hook graph.
// The v12 change is clinician-only. Patient summaries from v11/v10/v9/v8/v7/v6/v5 remain valid,
// so retain them instead of making an audience switch lose its saved summary.
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
  cancel: (slotKey?: string) => void
  restoreGenerationSlot: (slotKey: string, result: MedicalSummaryResult | undefined) => void
}

export function useMedicalSummary(): UseMedicalSummaryReturn {
  const autoGenerate = useSummaryPrefsStore((s) => s.autoGenerate)
  const setAutoGenerate = useSummaryPrefsStore((s) => s.setAutoGenerate)
  const modelId = useSummaryPrefsStore((s) => s.modelId)
  const setModelId = useSummaryPrefsStore((s) => s.setModelId)
  const { audience } = useAudience()
  const autoAiConsent = useAutoAiConsentState()

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
    const longitudinalInvestigationContext = ctx.clinicalData
      ? buildLongitudinalInvestigationContext(ctx.clinicalData, ctx.catalog)
      : ''
    const clinicalContext = [ctx.clinicalContext, longitudinalInvestigationContext]
      .filter(Boolean)
      .join('\n\n')
    const messages = generateMedicalSummaryUseCase.buildMessages({
      clinicalContext,
      catalog: ctx.catalog,
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
    })
    const overflow = createContextOverflowIssue(
      messages.map((message) => message.content).join('\n\n'),
      ctx.modelId,
      {
        selectedContext: ctx.clinicalContext,
        contextLimit: ctx.contextLimit,
      },
    )
    if (overflow) {
      throw new ContextOverflowError(overflow, ctx.locale)
    }

    const streamOnce = async () => {
      let full = ''
      await ctx.ai.stream(messages, {
        modelId: ctx.modelId,
        operationKey: ctx.operationKey,
        throwOnAbort: true,
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
    if (!parsed) return null
    const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData ?? undefined,
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
    })
    const generatedAt = Date.now()
    return {
      ...finalized,
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
    autoRunEnabled: isAutoAiEnabledForSource(autoGenerate, autoAiConsent),
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
    generate: slot.generate,
    cancel: slot.cancel,
    restoreGenerationSlot: slot.restoreSlot,
  }
}
