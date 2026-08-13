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
  MedicalSummaryCardErrors,
  MedicalSummaryCardId,
  MedicalSummaryResult,
  SummaryCoverageStats,
  SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'
import { MEDICAL_SUMMARY_CARD_IDS } from '@/src/core/entities/medical-summary.entity'
import {
  DEMO_MEDICAL_SUMMARY_GENERATION,
  DEMO_SAFETY_SCAN_GENERATION,
  demoMedicalSummarySnapshots,
  demoSafetyScanSnapshots,
  remapDemoSnapshotSourceKeys,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import {
  medicalSummaryStore,
  summaryCacheKey,
  SUMMARY_CACHE_MAX_AGE_MS,
} from './medical-summary-store'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
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
import { useAiExecutionDiagnosticsStore } from '@/src/application/stores/ai-execution-diagnostics.store'
import type { ClinicalContextAdaptation } from '@/src/core/utils/adaptive-clinical-context.utils'
import {
  MEDICAL_SUMMARY_CARD_REGISTRY,
  registeredMedicalSummaryCards,
  type MedicalSummaryCardAggregate,
  type MedicalSummaryCardDefinition,
} from '@/src/core/use-cases/medical-summary/medical-summary-card-registry'
import {
  MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
  MedicalSummaryCardProgressTimeoutError,
  streamWithCardProgressTimeout,
} from './card-progress-timeout'

export { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'

// Store + cache-key scheme live in medical-summary-store.ts so the IPS export
// can peek at generated summaries without importing this full hook graph.
// v14 retains unknown citations as claim-level warnings. Patient summaries
// from v11/v10/v9/v8/v7/v6/v5 remain valid legacy fallbacks; v12 live results
// and v13 grounding failures intentionally regenerate into this cache shape.
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

// One initial batch plus at most two progressively smaller combined retries.
// This is deliberately a hard cap: a persistently non-conforming model must
// surface card errors instead of starting an unbounded retry loop.
const MAX_CARD_BATCH_ATTEMPTS = 3

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
  /** Temporary scope reduction used to fit the selected model. */
  contextAdaptation: ClinicalContextAdaptation | null
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
  resolveSource: (key: string) => SummarySourceCatalogEntry | undefined
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
  /** Regenerate only cards recorded in result.cardErrors, preserving
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
    cardIds: MedicalSummaryCardId[]
    baseResult: MedicalSummaryResult
  }>())

  // Current key first, then older patient-only fallbacks (see comments above).
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
    useAiExecutionDiagnosticsStore.getState().clearOperationFeature(
      ctx.operationKey,
      'medical-summary',
    )
    const outputLocale: 'en' | 'zh-TW' = ctx.locale === 'zh-TW' ? 'zh-TW' : 'en'
    const longitudinalInvestigationContext = ctx.clinicalData
      ? buildLongitudinalInvestigationContext(ctx.clinicalData, ctx.catalog)
      : ''
    const clinicalContext = [ctx.clinicalContext, longitudinalInvestigationContext]
      .filter(Boolean)
      .join('\n\n')
    const retryRequest = moduleRetryRequestsRef.current.get(ctx.operationKey)
    moduleRetryRequestsRef.current.delete(ctx.operationKey)
    const isLocalModel = isCustomOpenAiModelId(ctx.modelId)
    const promptInput = {
      clinicalContext,
      piiLiterals: ctx.piiLiterals,
      catalog: ctx.catalog,
      locale: outputLocale,
      audience: ctx.audience === 'patient' ? 'patient' as const : 'medical' as const,
      harnessProfile: isLocalModel ? 'local-small' as const : 'frontier' as const,
    }
    const targetCards = retryRequest
      ? retryRequest.cardIds.map((cardId) => MEDICAL_SUMMARY_CARD_REGISTRY[cardId])
      : registeredMedicalSummaryCards(promptInput)
    // A manual retry uses the same multi-card transport as automatic retry:
    // all currently failed cards share one request and one copy of the context.
    const initialBatchMessages = generateMedicalSummaryUseCase.buildRegisteredCardBatchMessages(
      promptInput,
      targetCards.map((card) => card.buildBatchInstruction(promptInput)),
    )
    const messageSets = [initialBatchMessages]
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
    if (overflow) throw new ContextOverflowError(overflow, ctx.locale)

    const markValidationError = (cardId: MedicalSummaryCardId) => {
      useAiExecutionDiagnosticsStore.getState().markLatestOperationFeatureError(
        ctx.operationKey,
        'medical-summary',
        `${cardId}: PARSE_FAILED`,
      )
    }
    const warnUnknownSourceKeys = (
      card: MedicalSummaryCardDefinition,
      parsed: unknown | null,
    ) => {
      const unknownSourceKeys = parsed && card.findUnknownSourceKeys
        ? card.findUnknownSourceKeys(parsed, ctx.catalog)
        : []
      if (unknownSourceKeys.length > 0) {
        console.warn(
          `[medical-summary:${card.id}] grounding warning; unknown source keys:`,
          unknownSourceKeys,
        )
      }
    }

    const generation = (generatedAt: number) => ({
      source: 'live' as const,
      modelId: ctx.modelId,
      modelName: ctx.modelName,
      generatedAt,
    })
    const bundleRevision = medicalSummaryStore.getState().bundleRevision
    const completedCardIds = new Set<MedicalSummaryCardId>(
      retryRequest?.baseResult.completedCardIds ?? (
        retryRequest
          ? MEDICAL_SUMMARY_CARD_IDS.filter((cardId) => (
              !retryRequest.baseResult.cardErrors?.[cardId] &&
              (cardId !== 'safety' || Boolean(retryRequest.baseResult.safety))
            ))
          : []
      ),
    )
    targetCards.forEach((card) => completedCardIds.delete(card.id))
    let progressiveAggregate: MedicalSummaryCardAggregate = {
      summary: generateMedicalSummaryUseCase.createAiDraftFromResult(retryRequest?.baseResult),
      safety: retryRequest?.baseResult.safety,
    }
    const progressiveCardErrors: MedicalSummaryCardErrors = {
      ...(retryRequest?.baseResult.cardErrors ?? {}),
    }
    const publishedCardIds = new Set<MedicalSummaryCardId>()
    // Once a closing marker has arrived, that card block is immutable. Remember
    // its parse result so an invalid block is not parsed and logged again for
    // every later stream chunk while the model writes the remaining cards.
    const batchParseResults = new Map<MedicalSummaryCardId, unknown | null>()
    const publishCardResult = (card: MedicalSummaryCardDefinition, parsed: unknown) => {
      progressiveAggregate = card.apply(progressiveAggregate, parsed, ctx.catalog)
      publishedCardIds.add(card.id)
      completedCardIds.add(card.id)
      delete progressiveCardErrors[card.id]

      const state = medicalSummaryStore.getState()
      if (
        state.bundleRevision !== bundleRevision ||
        !state.running[ctx.operationKey]
      ) return
      const generatedAt = Date.now()
      const finalized = generateMedicalSummaryUseCase.finalizeResult(
        progressiveAggregate.summary,
        ctx.catalog,
        {
          clinicalData: ctx.clinicalData ?? undefined,
          audience: ctx.audience === 'patient' ? 'patient' : 'medical',
          locale: outputLocale,
          strictGrounding: isLocalModel,
        },
      )
      state.setResult(ctx.operationKey, {
        ...finalized,
        safety: progressiveAggregate.safety
          ? { ...progressiveAggregate.safety, generation: generation(generatedAt) }
          : undefined,
        cardErrors: Object.keys(progressiveCardErrors).length > 0
          ? { ...progressiveCardErrors }
          : undefined,
        completedCardIds: [...completedCardIds],
        generation: generation(generatedAt),
      })
    }

    type CardRunOutcome =
      | { cardId: MedicalSummaryCardId; result: unknown }
      | { cardId: MedicalSummaryCardId; error: 'PARSE_FAILED' }
    const settled: Array<PromiseSettledResult<CardRunOutcome>> = []
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[medical-summary] batch attempt 1/${MAX_CARD_BATCH_ATTEMPTS}: ${targetCards.map((card) => card.id).join(',')}`,
      )
    }
    try {
      const parseInitialChunk = (streamedText: string): boolean => {
        let madeProgress = false
        targetCards.forEach((card) => {
          if (
            publishedCardIds.has(card.id) ||
            batchParseResults.has(card.id) ||
            !card.hasCompleteBatchBlock(streamedText)
          ) return
          const parsed = card.parseBatch(streamedText, ctx.catalog)
          batchParseResults.set(card.id, parsed)
          warnUnknownSourceKeys(card, parsed)
          if (parsed) {
            publishCardResult(card, parsed)
            madeProgress = true
          }
        })
        return madeProgress
      }
      const { fullText: full, timedOut } = await streamWithCardProgressTimeout({
        stream: (signal, onChunk) => ctx.ai.stream(initialBatchMessages, {
          modelId: ctx.modelId,
          operationKey: ctx.operationKey,
          diagnosticFeature: 'medical-summary',
          throwOnAbort: true,
          signal,
          ...(isLocalModel
            ? { temperature: 0, reasoningEffort: 'low' as const }
            : {}),
          onChunk,
        }),
        onChunk: parseInitialChunk,
        timeoutMs: isLocalModel ? MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS : null,
      })
      if (timedOut && process.env.NODE_ENV !== 'production') {
        console.info('[medical-summary] batch attempt 1 aborted after 45s without a new valid card')
      }
      targetCards.forEach((card) => {
        const hadStreamParse = batchParseResults.has(card.id)
        const parsed = hadStreamParse
          ? batchParseResults.get(card.id) ?? null
          : card.parseBatch(full, ctx.catalog)
        if (!hadStreamParse) warnUnknownSourceKeys(card, parsed)
        if (parsed && !publishedCardIds.has(card.id)) publishCardResult(card, parsed)
        if (parsed) {
          settled.push({
            status: 'fulfilled',
            value: { cardId: card.id, result: parsed },
          })
        } else if (timedOut) {
          settled.push({
            status: 'rejected',
            reason: new MedicalSummaryCardProgressTimeoutError(
              MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
            ),
          })
        } else {
          markValidationError(card.id)
          settled.push({
            status: 'fulfilled',
            value: { cardId: card.id, error: 'PARSE_FAILED' },
          })
        }
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      targetCards.forEach((card) => {
        const parsed = batchParseResults.get(card.id)
        settled.push(parsed
          ? { status: 'fulfilled', value: { cardId: card.id, result: parsed } }
          : { status: 'rejected', reason: error })
      })
    }

    // Retry every remaining failed card in ONE progressively smaller batch.
    // Successful cards remain visible and are never regenerated. Attempts are
    // capped at three total calls (initial + two combined retries).
    for (let attempt = 2; attempt <= MAX_CARD_BATCH_ATTEMPTS; attempt += 1) {
      const cardsToRetry = targetCards
        .filter((_card, index) => {
          const outcome = settled[index]
          return outcome?.status === 'rejected' || (
            outcome?.status === 'fulfilled' && 'error' in outcome.value
          )
        })
        .sort((left, right) => Number(right.id === 'medications') - Number(left.id === 'medications'))
      if (cardsToRetry.length === 0) break

      if (process.env.NODE_ENV !== 'production') {
        console.info(
          `[medical-summary] batch attempt ${attempt}/${MAX_CARD_BATCH_ATTEMPTS}: ${cardsToRetry.map((card) => card.id).join(',')}`,
        )
      }

      const retryBatchParseResults = new Map<MedicalSummaryCardId, unknown | null>()
      const retryBatchMessages = generateMedicalSummaryUseCase.buildRegisteredCardBatchMessages(
        promptInput,
        cardsToRetry.map((card) => card.buildBatchInstruction(promptInput)),
      )
      try {
        const parseRetryChunk = (streamedText: string): boolean => {
          let madeProgress = false
          cardsToRetry.forEach((card) => {
            if (
              publishedCardIds.has(card.id) ||
              retryBatchParseResults.has(card.id) ||
              !card.hasCompleteBatchBlock(streamedText)
            ) return
            const parsed = card.parseBatch(streamedText, ctx.catalog)
            retryBatchParseResults.set(card.id, parsed)
            warnUnknownSourceKeys(card, parsed)
            if (parsed) {
              publishCardResult(card, parsed)
              madeProgress = true
            }
          })
          return madeProgress
        }
        const { fullText: full, timedOut } = await streamWithCardProgressTimeout({
          stream: (signal, onChunk) => ctx.ai.stream(retryBatchMessages, {
            modelId: ctx.modelId,
            operationKey: ctx.operationKey,
            diagnosticFeature: 'medical-summary',
            throwOnAbort: true,
            signal,
            ...(isLocalModel
              ? { temperature: 0, reasoningEffort: 'low' as const }
              : {}),
            onChunk,
          }),
          onChunk: parseRetryChunk,
          timeoutMs: isLocalModel ? MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS : null,
        })
        if (timedOut && process.env.NODE_ENV !== 'production') {
          console.info(
            `[medical-summary] batch attempt ${attempt} aborted after 45s without a new valid card`,
          )
        }
        cardsToRetry.forEach((card) => {
          const cardIndex = targetCards.indexOf(card)
          const hadStreamParse = retryBatchParseResults.has(card.id)
          const parsed = hadStreamParse
            ? retryBatchParseResults.get(card.id) ?? null
            : card.parseBatch(full, ctx.catalog)
          if (!hadStreamParse) warnUnknownSourceKeys(card, parsed)
          if (parsed && !publishedCardIds.has(card.id)) publishCardResult(card, parsed)
          if (parsed) {
            settled[cardIndex] = {
              status: 'fulfilled',
              value: { cardId: card.id, result: parsed },
            }
          } else if (timedOut) {
            settled[cardIndex] = {
              status: 'rejected',
              reason: new MedicalSummaryCardProgressTimeoutError(
                MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
              ),
            }
          } else {
            markValidationError(card.id)
            settled[cardIndex] = {
              status: 'fulfilled',
              value: { cardId: card.id, error: 'PARSE_FAILED' },
            }
          }
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        cardsToRetry.forEach((card) => {
          const parsed = retryBatchParseResults.get(card.id)
          settled[targetCards.indexOf(card)] = parsed
            ? { status: 'fulfilled', value: { cardId: card.id, result: parsed } }
            : { status: 'rejected', reason: error }
        })
      }
    }

    const aborted = settled.find((outcome) =>
      outcome.status === 'rejected' &&
      outcome.reason instanceof Error &&
      outcome.reason.name === 'AbortError',
    )
    if (aborted?.status === 'rejected') throw aborted.reason

    let aggregate: MedicalSummaryCardAggregate = {
      summary: generateMedicalSummaryUseCase.createAiDraftFromResult(retryRequest?.baseResult),
      safety: retryRequest?.baseResult.safety,
    }
    const cardErrors: MedicalSummaryCardErrors = {
      ...(retryRequest?.baseResult.cardErrors ?? {}),
    }
    settled.forEach((outcome, index) => {
      const card = targetCards[index]
      if (outcome.status === 'rejected') {
        cardErrors[card.id] = getUserErrorMessage(outcome.reason)
        return
      }
      if ('error' in outcome.value) {
        cardErrors[card.id] = outcome.value.error
        return
      }
      aggregate = card.apply(aggregate, outcome.value.result, ctx.catalog)
      completedCardIds.add(card.id)
      delete cardErrors[card.id]
    })

    const finalized = generateMedicalSummaryUseCase.finalizeResult(
      aggregate.summary,
      ctx.catalog,
      {
        clinicalData: ctx.clinicalData ?? undefined,
        audience: ctx.audience === 'patient' ? 'patient' : 'medical',
        locale: outputLocale,
        strictGrounding: isLocalModel,
      },
    )
    const generatedAt = Date.now()
    return {
      ...finalized,
      safety: aggregate.safety
        ? { ...aggregate.safety, generation: generation(generatedAt) }
        : undefined,
      cardErrors: Object.keys(cardErrors).length > 0 ? cardErrors : undefined,
      completedCardIds: [...completedCardIds],
      generation: generation(generatedAt),
    }
  }, [])

  // Demo bundle: runs through the SAME parse → finalize pipeline as a live
  // reply, so citations verify against the real catalog.
  const demoSeed = useCallback((ctx: AiSlotDemoContext): MedicalSummaryResult | null => {
    const demoAudience = ctx.audience === 'patient' ? 'patient' : 'medical'
    const snapshot = remapDemoSnapshotSourceKeys(
      demoMedicalSummarySnapshots[demoAudience],
      ctx.catalog,
    )
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
    if (!parsed) return null
    const safetySnapshot = remapDemoSnapshotSourceKeys(
      demoSafetyScanSnapshots[demoAudience],
      ctx.catalog,
    )
    const safety = MEDICAL_SUMMARY_CARD_REGISTRY.safety.parseRetry(
      JSON.stringify(safetySnapshot),
      ctx.catalog,
    )
    const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData,
      audience: demoAudience,
      locale: 'zh-TW',
    })
    return {
      ...finalized,
      safety: safety
        ? {
            ...(safety as NonNullable<MedicalSummaryResult['safety']>),
            scannedCount: ctx.catalog.length,
            generation: DEMO_SAFETY_SCAN_GENERATION,
          }
        : undefined,
      completedCardIds: [...MEDICAL_SUMMARY_CARD_IDS],
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
  const catalogByKey = useMemo(
    () => new Map(slot.catalog.map((entry) => [entry.key, entry])),
    [slot.catalog],
  )
  const resolveSource = useCallback(
    (key: string) => catalogByKey.get(key.trim()),
    [catalogByKey],
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
    const cardIds = MEDICAL_SUMMARY_CARD_IDS.filter(
      (cardId) => Boolean(exactResult?.cardErrors?.[cardId]),
    )
    if (!exactResult || cardIds.length === 0) {
      await generate()
      return
    }
    const request = {
      cardIds,
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
    contextAdaptation: slot.contextAdaptation,
    hasPatient: slot.hasPatient,
    dataReady: slot.dataReady,
    scopeKey: slot.scopeKey,
    generationSlotKey: slot.slotKey,
    isCurrentSlotGenerating: slot.isRunning,
    readGenerationSlot,
    resolveSource,
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
