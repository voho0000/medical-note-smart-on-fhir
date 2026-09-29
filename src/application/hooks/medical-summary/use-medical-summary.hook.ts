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

import { createModelExecution, modelExecutionLabel, mergeModelExecutions } from '@/src/shared/utils/ai-model-execution'
import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
import { useCallback, useMemo, useRef } from 'react'
import {
  isContextOverflowError,
  type ContextOverflowIssue,
} from '@/src/shared/utils/context-budget'
import {
  loadEncryptedCache,
  saveEncryptedCache,
} from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  generateMedicalSummaryUseCase,
  buildCoverageStats,
  buildLongitudinalInvestigationContext,
  MEDICAL_SUMMARY_MODEL_ID,
  type GenerateMedicalSummaryInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { usesCompactSummaryHarness } from '@/src/core/use-cases/medical-summary/medical-summary-harness'
import { buildOverviewSnapshot } from '@/src/core/use-cases/medical-summary/overview-snapshot'
import type {
  MedicalSummaryCardErrors,
  MedicalSummaryCardId,
  MedicalSummaryModuleId,
  MedicalSummaryResult,
  SummaryCoverageStats,
  SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'
import {
  MEDICAL_SUMMARY_CARD_IDS,
  MEDICAL_SUMMARY_MODULE_IDS,
} from '@/src/core/entities/medical-summary.entity'
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
import { useMedcloudLaunchStore } from '@/src/application/launch/medcloud-launch.store'
import {
  useAiSlotGeneration,
  type AiSlotDemoContext,
  type AiSlotRunContext,
} from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'
import {
  getUserErrorMessage,
  isProviderContextWindowExceededError,
} from '@/src/core/errors'
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
import { runWithContextWindowRetry } from '@/src/application/hooks/ai-generation/context-window-retry'
import { measureSummaryCardOutcomes } from './summary-result-measurement'
import { toTraditionalChinese } from '@/src/core/utils/zh-hant-normalize.utils'
import type { AiRunMetrics } from '@/src/application/hooks/ai-generation/run-generation-job'
import { nowMs } from '@/src/application/telemetry/ai-outcome'

export { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'

// Store + cache-key scheme live in medical-summary-store.ts so the IPS export
// can peek at generated summaries without importing this full hook graph.
// 初診快覽 (v16) changed the artifact shape itself, so there is no longer any
// older cache generation that can be restored — every legacy entry regenerates.

const medicalSummaryResultModelId = (result: MedicalSummaryResult) =>
  result.generation?.modelId

// zh-TW backstop for the safety card's model-written prose (title/detail/
// recommendation). Evidence strings may be record excerpts and stay verbatim.
function localizeSafetyProse<T extends { alerts: Array<{ title: string; detail: string; recommendation?: string }> }>(
  safety: T,
  locale: 'en' | 'zh-TW',
): T {
  if (locale !== 'zh-TW') return safety
  return {
    ...safety,
    alerts: safety.alerts.map((alert) => ({
      ...alert,
      title: toTraditionalChinese(alert.title),
      detail: toTraditionalChinese(alert.detail),
      recommendation: toTraditionalChinese(alert.recommendation),
    })),
  }
}

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
  /** The selected summary model cannot run with the current credentials. */
  modelUnavailable: boolean
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
  const persistedModelId = useSummaryPrefsStore((s) => s.modelId)
  const runtimeModelId = useMedcloudLaunchStore((s) => s.runtimeModelId)
  const modelId = runtimeModelId ?? persistedModelId
  const setModelId = useSummaryPrefsStore((s) => s.setModelId)
  const { demographicsReadyForAi } = useAiDemographicsGate()
  const moduleRetryRequestsRef = useRef(new Map<string, {
    cardIds: MedicalSummaryCardId[]
    baseResult: MedicalSummaryResult
  }>())
  // Measurements only the producer can take, read back by the shared slot
  // engine when it reports the `ai_result` reliability event.
  const runMetricsRef = useRef(new Map<string, AiRunMetrics>())

  const loadCached = useCallback(async (slotKey: string) => (
    loadEncryptedCache<MedicalSummaryResult>(
      summaryCacheKey(slotKey),
      SUMMARY_CACHE_MAX_AGE_MS,
    )
  ), [])

  const run = useCallback(async (ctx: AiSlotRunContext): Promise<MedicalSummaryResult | null> => {
    // Monotonic: the number the redesign is judged on is "how long until the
    // clinician sees the first section", which a wall-clock adjustment must
    // not be able to change.
    const runStartedAt = nowMs()
    let firstCardMs: number | undefined
    const retryRequest = moduleRetryRequestsRef.current.get(ctx.operationKey)
    moduleRetryRequestsRef.current.delete(ctx.operationKey)
    if (!retryRequest) {
      useAiExecutionDiagnosticsStore.getState().clearOperationFeature(ctx.operationKey, 'medical-summary')
    }
    runMetricsRef.current.delete(ctx.operationKey)
    const initialExecution = () => createModelExecution(ctx.requestedModelId ?? ctx.modelId, ctx.modelId, ctx.modelName)
    // Provenance fallback for cards no lane managed to attribute. Each lane
    // keeps its OWN live execution: two concurrent streams must not overwrite
    // each other's reported identity.
    let aggregateExecution = initialExecution()
    const cardModelExecutions: Partial<Record<MedicalSummaryCardId, AiModelExecution>> = {}
    if (retryRequest) {
      const base = retryRequest.baseResult
      const baseGeneration = base.generation
      const baseExecution = baseGeneration?.source === 'live' && baseGeneration.modelExecution
        ? baseGeneration.modelExecution
        : createModelExecution(baseGeneration?.modelId ?? ctx.modelId, baseGeneration?.modelId ?? ctx.modelId, baseGeneration?.modelName)
      const retainedIds = base.completedCardIds ?? MEDICAL_SUMMARY_CARD_IDS.filter((id) => (
        !base.cardErrors?.[id] && (id !== 'safety' || Boolean(base.safety))
      ))
      for (const id of retainedIds) {
        if (retryRequest.cardIds.includes(id)) continue
        cardModelExecutions[id] = baseGeneration?.source === 'live'
          ? baseGeneration.cardModelExecutions?.[id] ?? baseExecution : baseExecution
      }
    }
    const outputLocale: 'en' | 'zh-TW' = ctx.locale === 'zh-TW' ? 'zh-TW' : 'en'
    const longitudinalInvestigationContext = ctx.clinicalData
      ? buildLongitudinalInvestigationContext(ctx.clinicalData, ctx.catalog)
      : ''
    const clinicalContext = [ctx.clinicalContext, longitudinalInvestigationContext]
      .filter(Boolean)
      .join('\n\n')
    // Harness is chosen by CONTEXT WINDOW, not by provider: the compact
    // contract compensates for a small window and a slow prefill, and a
    // sub-500K cloud model is in that class too.
    const useCompactHarness = usesCompactSummaryHarness(ctx.contextLimit)
    // Transport policy stays provider-shaped. Deterministic sampling and the
    // card-progress watchdog are properties of a user-configured endpoint, not
    // of the window size, so they remain gated on the custom-endpoint id.
    const isCustomEndpoint = isCustomOpenAiModelId(ctx.modelId)
    const promptInput: GenerateMedicalSummaryInput = {
      clinicalContext,
      piiLiterals: ctx.piiLiterals,
      catalog: ctx.catalog,
      locale: outputLocale,
      audience: ctx.audience === 'patient' ? 'patient' as const : 'medical' as const,
      harnessProfile: useCompactHarness ? 'local-small' as const : 'frontier' as const,
    }
    const targetCards = retryRequest
      ? retryRequest.cardIds.map((cardId) => MEDICAL_SUMMARY_CARD_REGISTRY[cardId])
      : registeredMedicalSummaryCards(promptInput)

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

    const generation = (generatedAt: number) => {
      const execution = mergeModelExecutions(Object.values(cardModelExecutions), aggregateExecution)
      return {
        source: 'live' as const, modelId: ctx.modelId,
        modelName: modelExecutionLabel(execution), modelExecution: execution,
        cardModelExecutions: { ...cardModelExecutions }, generatedAt,
        ...(firstCardMs === undefined ? {} : { firstCardMs }),
      }
    }
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
    // Publish whatever the two lanes have produced so far. Either lane may be
    // the one that lands a block first; the store write is identical.
    const publishProgress = () => {
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
          strictGrounding: isCustomEndpoint,
        },
      )
      state.setResult(ctx.operationKey, {
        ...finalized,
        safety: progressiveAggregate.safety
          ? { ...localizeSafetyProse(progressiveAggregate.safety, outputLocale), generation: generation(generatedAt) }
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
    type LaneOutcomes = Map<MedicalSummaryCardId, PromiseSettledResult<CardRunOutcome>>

    /**
     * One independent request lane: its own transport, its own context-window
     * recovery, its own bounded retries. Cards publish into the shared
     * progressive artifact the moment their closing marker parses, so the fast
     * lane's overview reaches the screen while the full lane is still writing.
     * Only an abort or a context-window rejection escapes; every other failure
     * is recorded per card.
     */
    const runLane = async (
      laneId: string,
      laneCards: MedicalSummaryCardDefinition[],
      laneInput: GenerateMedicalSummaryInput,
      /** Fast lane only. See the lane list below for why. */
      hiddenReasoning?: 'off',
    ): Promise<LaneOutcomes> => {
      let laneExecution = initialExecution()
      let laneCallCardIds = new Set<MedicalSummaryCardId>()
      // Keep a provider-confirmed reduction for every later parse retry in this
      // lane. A LiteLLM context rejection is transport feedback, not several
      // independent card failures, so context recovery happens around the
      // shared batch request before any per-card error is recorded.
      let transportClinicalContext = laneInput.clinicalContext

      const publishCardResult = (card: MedicalSummaryCardDefinition, parsed: unknown) => {
        cardModelExecutions[card.id] = laneExecution
        laneCallCardIds.add(card.id)
        progressiveAggregate = card.apply(progressiveAggregate, parsed, ctx.catalog)
        publishedCardIds.add(card.id)
        completedCardIds.add(card.id)
        delete progressiveCardErrors[card.id]
        if (firstCardMs === undefined) {
          firstCardMs = Math.round(nowMs() - runStartedAt)
          runMetricsRef.current.set(ctx.operationKey, { firstCardMs })
        }
        publishProgress()
      }

      const streamBatch = async (
        cards: MedicalSummaryCardDefinition[],
        onChunk: (streamedText: string) => boolean,
      ) => {
        const outcome = await runWithContextWindowRetry({
          clinicalContext: transportClinicalContext,
          contextLimit: ctx.contextLimit,
          modelId: ctx.modelId,
          modelName: ctx.modelName,
          locale: ctx.locale,
          buildRequest: (fittedClinicalContext) => {
            const fittedPromptInput = {
              ...laneInput,
              clinicalContext: fittedClinicalContext,
            }
            const messages = generateMedicalSummaryUseCase.buildRegisteredCardBatchMessages(
              fittedPromptInput,
              cards.map((card) => card.buildBatchInstruction(fittedPromptInput)),
              cards
                .map((card) => card.id)
                .filter((cardId): cardId is MedicalSummaryModuleId => (
                  (MEDICAL_SUMMARY_MODULE_IDS as readonly string[]).includes(cardId)
                )),
            )
            return {
              request: messages,
              requestText: messages.map((message) => message.content).join('\n\n'),
            }
          },
          execute: (messages) => streamWithCardProgressTimeout({
            stream: (signal, streamChunk) => {
              laneExecution = initialExecution()
              laneCallCardIds = new Set()
              return ctx.ai.stream(messages, {
                modelId: ctx.modelId,
                operationKey: ctx.operationKey,
                diagnosticFeature: 'medical-summary',
                requestedModelId: ctx.requestedModelId,
                onModelExecution: (execution) => {
                  laneExecution = { ...laneExecution, ...execution }
                  aggregateExecution = laneExecution
                  // Metadata can arrive after a card's closing marker. Keep the
                  // final identity/uncertainty for every card produced by this call.
                  for (const id of laneCallCardIds) cardModelExecutions[id] = laneExecution
                },
                throwOnAbort: true,
                signal,
                ...(isCustomEndpoint
                  ? { temperature: 0, reasoningEffort: 'low' as const }
                  : {}),
                ...(hiddenReasoning ? { hiddenReasoning } : {}),
                onChunk: streamChunk,
              })
            },
            onChunk,
            timeoutMs: isCustomEndpoint ? MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS : null,
          }),
          onRetry: (reason, retry) => {
            if (process.env.NODE_ENV !== 'production') {
              console.info(`[medical-summary:${laneId}] context retry ${retry}: ${reason}`)
            }
          },
        })
        transportClinicalContext = outcome.clinicalContext
        return outcome.value
      }

      const outcomes: LaneOutcomes = new Map()
      const runAttempt = async (
        attempt: number,
        cards: MedicalSummaryCardDefinition[],
      ) => {
        if (process.env.NODE_ENV !== 'production') {
          console.info(
            `[medical-summary:${laneId}] batch attempt ${attempt}/${MAX_CARD_BATCH_ATTEMPTS}: ${cards.map((card) => card.id).join(',')}`,
          )
        }
        const attemptParseResults = new Map<MedicalSummaryCardId, unknown | null>()
        try {
          const parseChunk = (streamedText: string): boolean => {
            let madeProgress = false
            cards.forEach((card) => {
              if (
                publishedCardIds.has(card.id) ||
                attemptParseResults.has(card.id) ||
                !card.hasCompleteBatchBlock(streamedText)
              ) return
              const parsed = card.parseBatch(streamedText, ctx.catalog)
              attemptParseResults.set(card.id, parsed)
              warnUnknownSourceKeys(card, parsed)
              if (parsed) {
                publishCardResult(card, parsed)
                madeProgress = true
              }
            })
            return madeProgress
          }
          const { fullText: full, timedOut } = await streamBatch(cards, parseChunk)
          if (timedOut && process.env.NODE_ENV !== 'production') {
            console.info(
              `[medical-summary:${laneId}] batch attempt ${attempt} aborted after 45s without a new valid card`,
            )
          }
          cards.forEach((card) => {
            const hadStreamParse = attemptParseResults.has(card.id)
            const parsed = hadStreamParse
              ? attemptParseResults.get(card.id) ?? null
              : card.parseBatch(full, ctx.catalog)
            if (!hadStreamParse) warnUnknownSourceKeys(card, parsed)
            if (parsed && !publishedCardIds.has(card.id)) publishCardResult(card, parsed)
            if (parsed) {
              outcomes.set(card.id, {
                status: 'fulfilled',
                value: { cardId: card.id, result: parsed },
              })
            } else if (timedOut) {
              outcomes.set(card.id, {
                status: 'rejected',
                reason: new MedicalSummaryCardProgressTimeoutError(
                  MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
                ),
              })
            } else {
              markValidationError(card.id)
              outcomes.set(card.id, {
                status: 'fulfilled',
                value: { cardId: card.id, error: 'PARSE_FAILED' },
              })
            }
          })
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          if (
            isContextOverflowError(error) ||
            isProviderContextWindowExceededError(error)
          ) throw error
          cards.forEach((card) => {
            const parsed = attemptParseResults.get(card.id)
            outcomes.set(card.id, parsed
              ? { status: 'fulfilled', value: { cardId: card.id, result: parsed } }
              : { status: 'rejected', reason: error })
          })
        }
      }

      await runAttempt(1, laneCards)
      // Retry every remaining failed card in ONE progressively smaller batch.
      // Successful cards remain visible and are never regenerated. Attempts are
      // capped at three total calls per lane (initial + two combined retries).
      for (let attempt = 2; attempt <= MAX_CARD_BATCH_ATTEMPTS; attempt += 1) {
        const cardsToRetry = laneCards
          .filter((card) => {
            const outcome = outcomes.get(card.id)
            return !outcome || outcome.status === 'rejected' || (
              outcome.status === 'fulfilled' && 'error' in outcome.value
            )
          })
          // Overview first on every retry too: it is the section the user is
          // looking at while the rest is still being rewritten.
          .sort((left, right) => Number(right.id === 'overview') - Number(left.id === 'overview'))
        if (cardsToRetry.length === 0) break
        await runAttempt(attempt, cardsToRetry)
      }
      return outcomes
    }

    // Two lanes only for a fresh compact-harness generation: the overview is
    // asked for on its own, so the first visible section no longer waits behind
    // the whole-chart prompt the other cards need. A module retry already
    // targets exactly the failed cards, and the frontier harness keeps the
    // established single batch.
    const fastLaneCards = !retryRequest && useCompactHarness
      ? targetCards.filter((card) => card.id === 'overview')
      : []
    const fullLaneCards = fastLaneCards.length > 0
      ? targetCards.filter((card) => card.id !== 'overview')
      : targetCards
    // The fast lane does NOT reuse the fitted narrative. It is built from a
    // purpose-made snapshot whose size is bounded by per-section caps rather
    // than by the chart, because on an on-prem GPU the wait for the first
    // section is prefill and a line-filtered narrative grows with the patient.
    //
    // No clinical data (still calculating) or a snapshot that cites nothing
    // would leave the lane with no evidence at all; the single batch over the
    // fitted context is better than an empty prompt.
    const builtSnapshot = fastLaneCards.length > 0 && ctx.clinicalData
      ? buildOverviewSnapshot(
          { clinicalData: ctx.clinicalData, catalog: ctx.catalog, patient: ctx.patient },
          { nowMs: ctx.clinicalNowMs, locale: outputLocale },
        )
      : null
    const overviewSnapshot = builtSnapshot && builtSnapshot.catalog.length > 0
      ? builtSnapshot
      : null
    if (overviewSnapshot && process.env.NODE_ENV !== 'production') {
      console.info(
        `[medical-summary:fast] overview snapshot ${overviewSnapshot.estimatedTokens} est. tokens, ` +
        `${overviewSnapshot.catalog.length} sources`,
        overviewSnapshot.sections,
      )
    }
    const lanes: Array<{
      id: string
      cards: MedicalSummaryCardDefinition[]
      input: GenerateMedicalSummaryInput
      hiddenReasoning?: 'off'
    }> =
      overviewSnapshot && fullLaneCards.length > 0
        ? [
            {
              id: 'fast',
              cards: fastLaneCards,
              input: {
                ...promptInput,
                clinicalContext: overviewSnapshot.clinicalContext,
                catalog: overviewSnapshot.catalog,
                singleLanguageContract: true,
              },
              // Measured on the overview lane: the cost is hidden reasoning,
              // not prompt size, and soft prompting does not shorten it. The
              // full lane keeps the model's default thinking.
              hiddenReasoning: 'off',
            },
            { id: 'full', cards: fullLaneCards, input: promptInput },
          ]
        : [{ id: 'batch', cards: targetCards, input: promptInput }]

    const laneSettlements = await Promise.allSettled(
      lanes.map((lane) => runLane(lane.id, lane.cards, lane.input, lane.hiddenReasoning)),
    )
    // A user stop must terminate the whole generation even when the other lane
    // finished; a context-window rejection is the actionable scope error the
    // banner exists for. Everything else has already been recorded per card.
    const abortedLane = laneSettlements.find((settlement) =>
      settlement.status === 'rejected' &&
      settlement.reason instanceof Error &&
      settlement.reason.name === 'AbortError',
    )
    if (abortedLane?.status === 'rejected') throw abortedLane.reason
    const rejectedLane = laneSettlements.find((settlement) => settlement.status === 'rejected')
    if (rejectedLane?.status === 'rejected') throw rejectedLane.reason

    const settledByCard: LaneOutcomes = new Map()
    for (const settlement of laneSettlements) {
      if (settlement.status !== 'fulfilled') continue
      for (const [cardId, outcome] of settlement.value) settledByCard.set(cardId, outcome)
    }

    let aggregate: MedicalSummaryCardAggregate = {
      summary: generateMedicalSummaryUseCase.createAiDraftFromResult(retryRequest?.baseResult),
      safety: retryRequest?.baseResult.safety,
    }
    const cardErrors: MedicalSummaryCardErrors = {
      ...(retryRequest?.baseResult.cardErrors ?? {}),
    }
    targetCards.forEach((card) => {
      const outcome = settledByCard.get(card.id)
      if (!outcome || outcome.status === 'rejected') {
        cardErrors[card.id] = outcome
          ? getUserErrorMessage(outcome.reason)
          : 'PARSE_FAILED'
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
        strictGrounding: isCustomEndpoint,
      },
    )
    const generatedAt = Date.now()
    // One outcome per target card, across both lanes; a card whose lane never
    // reported counts as a parse failure, matching cardErrors above.
    ctx.measureResult?.(measureSummaryCardOutcomes(targetCards.map((card) => (
      settledByCard.get(card.id) ?? { status: 'fulfilled' as const, value: { error: 'PARSE_FAILED' as const } }
    ))))
    return {
      ...finalized,
      safety: aggregate.safety
        ? { ...localizeSafetyProse(aggregate.safety, outputLocale), generation: generation(generatedAt) }
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
    const demoLocale = ctx.locale === 'zh-TW' ? 'zh-TW' : 'en'
    const snapshot = remapDemoSnapshotSourceKeys(
      demoMedicalSummarySnapshots[demoLocale][demoAudience],
      ctx.catalog,
    )
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
    if (!parsed) return null
    const safetySnapshot = remapDemoSnapshotSourceKeys(
      demoSafetyScanSnapshots[demoLocale][demoAudience],
      ctx.catalog,
    )
    const safety = MEDICAL_SUMMARY_CARD_REGISTRY.safety.parseRetry(
      JSON.stringify(safetySnapshot),
      ctx.catalog,
    )
    const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, ctx.catalog, {
      clinicalData: ctx.clinicalData,
      audience: demoAudience,
      locale: demoLocale,
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

  const readRunMetrics = useCallback(
    (slotKey: string): AiRunMetrics | undefined => runMetricsRef.current.get(slotKey),
    [],
  )

  const slot = useAiSlotGeneration<MedicalSummaryResult>({
    // Summary and the safety scan are produced by ONE generation job, so the
    // reliability event is reported once, as `summary`.
    analyticsSurface: 'summary',
    defaultModelId: MEDICAL_SUMMARY_MODEL_ID,
    selectedModelId: modelId,
    // The persisted "自動產生" switch is the single authorization for a
    // background run; it is off by default. Manual generation is unaffected.
    autoRunEnabled: demographicsReadyForAi && autoGenerate,
    // Even a MANUAL generate waits for the full clinical dataset.
    requireDataReadyToGenerate: true,
    store: medicalSummaryStore,
    cacheKeyFor: summaryCacheKey,
    cacheMaxAgeMs: SUMMARY_CACHE_MAX_AGE_MS,
    loadCached,
    run,
    readRunMetrics,
    demoSeed,
    resultModelId: medicalSummaryResultModelId,
    retainResultOnModelChange: true,
    blockUnavailableSelectedModel: true,
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
    // The Medcloud launch model is an initial session choice, not a lock. A
    // deliberate picker selection must take effect for both display and the
    // next summary request instead of being saved silently for after exit.
    useMedcloudLaunchStore.getState().setRuntimeModelId(null)
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
    modelUnavailable: slot.modelUnavailable,
    setModel,
    recordGenerationCompletion,
    generate,
    retryFailedModules,
    cancel: slot.cancel,
    restoreGenerationSlot: slot.restoreSlot,
  }
}
