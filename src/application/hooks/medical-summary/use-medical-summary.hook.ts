// Medical Summary hook — thin adapter over the shared AI slot-generation
// engine (src/application/hooks/ai-generation/): runs the structured
// generation on the selected summary model, verifies citations against the
// bundle, and caches per patient+audience+model so tab switches / reloads
// don't re-bill.
//
// Auto-generate policy: when enabled, every available selected model runs once
// for an empty patient+audience+model slot after cache/auth hydration.
'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useAudience } from '@/src/application/providers/audience.provider'
import { preflightContextWarning } from '@/src/shared/utils/context-budget'
import {
  loadEncryptedCache,
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
import { demoMedicalSummarySnapshots } from '@/src/infrastructure/demo/demo-ai-snapshots'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import {
  useAiSlotGeneration,
  type AiSlotDemoContext,
  type AiSlotRunContext,
} from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'

const SUMMARY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
// v12: surface clinically meaningful treatment patterns and true overlapping
// prescriptions from two non-pharmacy institutions. Older results regenerate.
const summaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary12', scanKey)
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

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
const medicalSummaryStore = createAiResultStore<MedicalSummaryResult>()

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
    // Default OFF until first-run onboarding records an explicit choice. This
    // prevents a new patient's data from reaching cloud AI before consent.
    autoGenerate: false,
    setAutoGenerate: (value) => set({ autoGenerate: value }),
    modelId: MEDICAL_SUMMARY_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})

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
  const autoGenerate = useSummaryPrefsStore((s) => s.autoGenerate)
  const setAutoGenerate = useSummaryPrefsStore((s) => s.setAutoGenerate)
  const modelId = useSummaryPrefsStore((s) => s.modelId)
  const setModelId = useSummaryPrefsStore((s) => s.setModelId)
  const { audience } = useAudience()

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
    const clinicalContext = [ctx.getFullClinicalContext(), longitudinalInvestigationContext]
      .filter(Boolean)
      .join('\n\n')
    // Pre-flight: this pipeline doesn't truncate, so warn (don't silently fail)
    // when the selected context alone overruns the model's window.
    const overflow = preflightContextWarning(clinicalContext, ctx.modelId, ctx.locale)
    if (overflow) toast.warning(overflow)
    const messages = generateMedicalSummaryUseCase.buildMessages({
      clinicalContext,
      catalog: ctx.catalog,
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
    })

    const streamOnce = async () => {
      let full = ''
      await ctx.ai.stream(messages, {
        modelId: ctx.modelId,
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
    return generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData ?? undefined,
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
    })
  }, [])

  // Demo bundle: runs through the SAME parse → finalize pipeline as a live
  // reply, so citations verify against the real catalog.
  const demoSeed = useCallback((ctx: AiSlotDemoContext): MedicalSummaryResult | null => {
    const snapshot = demoMedicalSummarySnapshots[ctx.audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
    if (!parsed) return null
    return generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData,
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      locale: 'zh-TW',
    })
  }, [])

  const slot = useAiSlotGeneration<MedicalSummaryResult>({
    defaultModelId: MEDICAL_SUMMARY_MODEL_ID,
    selectedModelId: modelId,
    autoRunEnabled: autoGenerate,
    // Even a MANUAL generate waits for the full clinical dataset.
    requireDataReadyToGenerate: true,
    store: medicalSummaryStore,
    cacheKeyFor: summaryCacheKey,
    cacheMaxAgeMs: SUMMARY_CACHE_MAX_AGE_MS,
    loadCached,
    run,
    demoSeed,
  })

  // Deterministic coverage stats for the coverage card — recomputes only when
  // the bundle changes.
  const coverage = useMemo(
    () => (slot.dataReady && slot.clinicalData ? buildCoverageStats(slot.clinicalData) : null),
    [slot.dataReady, slot.clinicalData],
  )

  // Switching model just changes which per-model slot the view reads — it does
  // NOT cancel or clear anything. The old model's in-flight run keeps going and
  // lands in its own slot; the new model shows its cached result, its spinner
  // if still generating, or auto-generates if it has neither (user directive
  // 2026-07-07).
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  return {
    result: slot.result,
    coverage,
    isGenerating: slot.isRunning,
    error: slot.error,
    hasPatient: slot.hasPatient,
    dataReady: slot.dataReady,
    isHydrated: slot.isHydrated,
    autoGenerate,
    setAutoGenerate,
    model: modelId,
    setModel,
    generate: slot.generate,
  }
}
