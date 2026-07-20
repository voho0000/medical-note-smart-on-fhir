// Medical Summary orchestration layer. The structured summary and safety scan
// remain independently validated AI pipelines, but the product exposes one
// generation lifecycle, one model/auto preference, and one restore state.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMedicalSummary } from './use-medical-summary.hook'
import { useSafetyAlerts } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import {
  recordAutoAiRealDataDecision,
  recordLocalImportAiDecision,
  markLocalImportAiConsentReady,
  startLocalImportAiConsent,
  useAutoAiConsentState,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'
import { generateId } from '@/src/shared/utils/id.utils'
import type { ContextOverflowIssue } from '@/src/shared/utils/context-budget'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult } from '@/src/core/entities/safety-alert.entity'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

function createBatchId(sequence: number) {
  return `${Date.now().toString(36)}-${sequence.toString(36)}`
}

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now()
}

export interface SummaryGenerationBatchInfo {
  id: string
  modelName: string
  startedAt: number
}

interface ActiveGenerationBatch extends SummaryGenerationBatchInfo {
  scopeKey: string
  startedAtMonotonic: number
  summarySlotKey: string
  safetySlotKey: string
  summaryPreviousResult: MedicalSummaryResult | undefined
  safetyPreviousResult: SafetyScanResult | undefined
  expectsSummary: boolean
  expectsSafety: boolean
  coordinatedAuto: boolean
  cancelled: boolean
  summaryStarted: boolean
  safetyStarted: boolean
  summarySettled: boolean
  safetySettled: boolean
  summarySucceeded: boolean
  safetySucceeded: boolean
  summaryOutcomeError: string | null
  safetyOutcomeError: string | null
  summaryOutcomeIssue: ContextOverflowIssue | null
  safetyOutcomeIssue: ContextOverflowIssue | null
}

interface CompletedSummaryBatchTiming {
  scopeKey: string
  generatedAt: number
  modelId: string
  completedAt: number
  durationMs: number
}

interface CompletedBatchStatus {
  scopeKey: string
  summarySlotKey: string
  safetySlotKey: string
  summaryError: string | null
  safetyError: string | null
  summaryIssue: ContextOverflowIssue | null
  safetyIssue: ContextOverflowIssue | null
}

interface PresentedModelPair {
  scopeKey: string
  ownerRuntimeId: string
  result: MedicalSummaryResult
  safetyResult: SafetyScanResult
}

interface CancelledBaseline {
  scopeKey: string
  summarySlotKey: string
  safetySlotKey: string
  result: MedicalSummaryResult | undefined
  safetyResult: SafetyScanResult | undefined
}

type GenerationPipeline = {
  kind: 'summary' | 'safety'
  run: () => Promise<void>
}

export function useMedicalSummaryOrchestrator() {
  const {
    result,
    resultOwnerRuntimeId: summaryResultOwnerRuntimeId,
    coverage,
    isGenerating: isSummaryGenerating,
    error: summaryError,
    issue: summaryIssue,
    hasPatient,
    dataReady,
    scopeKey,
    generationSlotKey: summaryGenerationSlotKey,
    isCurrentSlotGenerating: isCurrentSummarySlotGenerating,
    readGenerationSlot: readSummaryGenerationSlot,
    isHydrated: isSummaryHydrated,
    autoGenerate,
    setAutoGenerate: setSummaryAutoGenerate,
    model,
    resolvedModelName,
    setModel: setSummaryModel,
    recordGenerationCompletion,
    generate: generateSummary,
    cancel: cancelSummary,
    restoreGenerationSlot: restoreSummaryGenerationSlot,
  } = useMedicalSummary()
  const {
    result: safetyResult,
    resultOwnerRuntimeId: safetyResultOwnerRuntimeId,
    isScanning: isSafetyGenerating,
    error: safetyError,
    issue: safetyIssue,
    generationSlotKey: safetyGenerationSlotKey,
    isCurrentSlotGenerating: isCurrentSafetySlotGenerating,
    readGenerationSlot: readSafetyGenerationSlot,
    isHydrated: isSafetyHydrated,
    autoScan,
    setAutoScan,
    model: safetyModel,
    setModel: setSafetyModel,
    scan: generateSafety,
    cancel: cancelSafety,
    restoreGenerationSlot: restoreSafetyGenerationSlot,
    resolveSource: resolveSafetySource,
  } = useSafetyAlerts()
  const currentModelPair = useMemo<PresentedModelPair | null>(() => {
    if (
      !result ||
      !safetyResult ||
      !summaryResultOwnerRuntimeId ||
      summaryResultOwnerRuntimeId !== safetyResultOwnerRuntimeId
    ) return null
    return {
      scopeKey,
      ownerRuntimeId: summaryResultOwnerRuntimeId,
      result,
      safetyResult,
    }
  }, [
    result,
    safetyResult,
    safetyResultOwnerRuntimeId,
    scopeKey,
    summaryResultOwnerRuntimeId,
  ])
  const autoAiConsent = useAutoAiConsentState()
  const effectiveAutoGenerate = autoAiConsent.source === 'demo'
    ? true
    : autoAiConsent.source === 'local'
      ? autoAiConsent.decision === 'auto'
      : autoGenerate
  const sequenceRef = useRef(0)
  const activeBatchRef = useRef<ActiveGenerationBatch | null>(null)
  const manualBatchIdsRef = useRef<Set<string>>(new Set())
  const cancelledBatchIdsRef = useRef<Set<string>>(new Set())
  const cancelledScopeKeysRef = useRef<Set<string>>(new Set())
  const [activeBatch, setActiveBatch] = useState<ActiveGenerationBatch | null>(null)
  const [cancellingScopeKey, setCancellingScopeKey] = useState<string | null>(null)
  const [lastCompletedTiming, setLastCompletedTiming] = useState<CompletedSummaryBatchTiming | null>(null)
  const [manualBatchCounts, setManualBatchCounts] = useState<Record<string, number>>({})
  const [lastCompletedBatchId, setLastCompletedBatchId] = useState<string | null>(null)
  const [lastBatchStatus, setLastBatchStatus] = useState<CompletedBatchStatus | null>(null)
  const [lastCoherentModelPair, setLastCoherentModelPair] = useState<PresentedModelPair | null>(
    currentModelPair,
  )
  const scopedLastCoherentModelPair = lastCoherentModelPair?.scopeKey === scopeKey
    ? lastCoherentModelPair
    : null
  const selectedModelPair = currentModelPair ?? scopedLastCoherentModelPair
  const hasUnpairedCurrentResults = Boolean(result && safetyResult && !currentModelPair)
  const selectedPresentationResult = selectedModelPair?.result ?? (
    hasUnpairedCurrentResults ? undefined : result
  )
  const selectedPresentationSafetyResult = selectedModelPair?.safetyResult ?? (
    hasUnpairedCurrentResults ? undefined : safetyResult
  )
  const [batchBaseline, setBatchBaseline] = useState({
    result: selectedPresentationResult,
    safetyResult: selectedPresentationSafetyResult,
  })
  const [cancelledBaseline, setCancelledBaseline] = useState<CancelledBaseline | null>(null)

  const scopedBatchStatus = lastBatchStatus?.scopeKey === scopeKey
    ? lastBatchStatus
    : null
  const useCapturedSummaryStatus = Boolean(
    scopedBatchStatus && scopedBatchStatus.summarySlotKey !== summaryGenerationSlotKey,
  )
  const useCapturedSafetyStatus = Boolean(
    scopedBatchStatus && scopedBatchStatus.safetySlotKey !== safetyGenerationSlotKey,
  )
  const presentedSummaryError = scopedBatchStatus && useCapturedSummaryStatus
    ? scopedBatchStatus.summaryError
    : summaryError
  const presentedSafetyError = scopedBatchStatus && useCapturedSafetyStatus
    ? scopedBatchStatus.safetyError
    : safetyError
  const presentedSummaryIssue = scopedBatchStatus && useCapturedSummaryStatus
    ? scopedBatchStatus.summaryIssue
    : summaryIssue
  const presentedSafetyIssue = scopedBatchStatus && useCapturedSafetyStatus
    ? scopedBatchStatus.safetyIssue
    : safetyIssue

  // Historical preferences lived in two stores. The summary preference is the
  // source of truth; after this one-way migration all user-facing controls
  // update both stores together.
  useEffect(() => {
    if (safetyModel !== model) setSafetyModel(model)
  }, [model, safetyModel, setSafetyModel])
  useEffect(() => {
    if (autoScan !== autoGenerate) setAutoScan(autoGenerate)
  }, [autoGenerate, autoScan, setAutoScan])

  const beginBatch = useCallback((expected: {
    summary?: boolean
    safety?: boolean
    coordinatedAuto?: boolean
    summaryStarted?: boolean
    safetyStarted?: boolean
  } = {}) => {
    const current = activeBatchRef.current
    if (current?.scopeKey === scopeKey) {
      const expectsSummary = current.expectsSummary || Boolean(expected.summary)
      const expectsSafety = current.expectsSafety || Boolean(expected.safety)
      const coordinatedAuto = current.coordinatedAuto || Boolean(expected.coordinatedAuto)
      const summaryStarted = current.summaryStarted || Boolean(expected.summaryStarted)
      const safetyStarted = current.safetyStarted || Boolean(expected.safetyStarted)
      const summarySlotKey = (
        current.coordinatedAuto &&
        expected.coordinatedAuto &&
        !current.summaryStarted &&
        expected.summaryStarted
      )
        ? summaryGenerationSlotKey
        : current.expectsSummary
          ? current.summarySlotKey
          : expected.summary ? summaryGenerationSlotKey : current.summarySlotKey
      const safetySlotKey = (
        current.coordinatedAuto &&
        expected.coordinatedAuto &&
        !current.safetyStarted &&
        expected.safetyStarted
      )
        ? safetyGenerationSlotKey
        : current.expectsSafety
          ? current.safetySlotKey
          : expected.safety ? safetyGenerationSlotKey : current.safetySlotKey
      const next = {
        ...current,
        expectsSummary,
        expectsSafety,
        coordinatedAuto,
        summaryStarted,
        safetyStarted,
        summarySlotKey,
        safetySlotKey,
        summaryPreviousResult: summarySlotKey !== current.summarySlotKey ||
          (!current.expectsSummary && Boolean(expected.summary))
          ? readSummaryGenerationSlot(summarySlotKey).result
          : current.summaryPreviousResult,
        safetyPreviousResult: safetySlotKey !== current.safetySlotKey ||
          (!current.expectsSafety && Boolean(expected.safety))
          ? readSafetyGenerationSlot(safetySlotKey).result
          : current.safetyPreviousResult,
      }
      if (
        next.expectsSummary !== current.expectsSummary ||
        next.expectsSafety !== current.expectsSafety ||
        next.coordinatedAuto !== current.coordinatedAuto ||
        next.summaryStarted !== current.summaryStarted ||
        next.safetyStarted !== current.safetyStarted ||
        next.summarySlotKey !== current.summarySlotKey ||
        next.safetySlotKey !== current.safetySlotKey
      ) {
        activeBatchRef.current = next
        setActiveBatch(next)
      }
      return current.id
    }
    sequenceRef.current += 1
    const id = createBatchId(sequenceRef.current)
    const next: ActiveGenerationBatch = {
      id,
      scopeKey,
      modelName: resolvedModelName,
      startedAt: Date.now(),
      startedAtMonotonic: monotonicNow(),
      summarySlotKey: summaryGenerationSlotKey,
      safetySlotKey: safetyGenerationSlotKey,
      summaryPreviousResult: readSummaryGenerationSlot(summaryGenerationSlotKey).result,
      safetyPreviousResult: readSafetyGenerationSlot(safetyGenerationSlotKey).result,
      expectsSummary: Boolean(expected.summary),
      expectsSafety: Boolean(expected.safety),
      coordinatedAuto: Boolean(expected.coordinatedAuto),
      cancelled: false,
      summaryStarted: Boolean(expected.summaryStarted),
      safetyStarted: Boolean(expected.safetyStarted),
      summarySettled: false,
      safetySettled: false,
      summarySucceeded: false,
      safetySucceeded: false,
      summaryOutcomeError: null,
      safetyOutcomeError: null,
      summaryOutcomeIssue: null,
      safetyOutcomeIssue: null,
    }
    activeBatchRef.current = next
    // Keep the last complete briefing visible throughout a refresh. New
    // summary/safety responses publish together when the batch settles, so the
    // page never mixes one newly generated half with one stale half.
    const matchingCancelledBaseline =
      cancelledBaseline?.scopeKey === scopeKey &&
      cancelledBaseline.summarySlotKey === summaryGenerationSlotKey &&
      cancelledBaseline.safetySlotKey === safetyGenerationSlotKey
        ? cancelledBaseline
        : null
    setBatchBaseline(
      matchingCancelledBaseline
        ? {
            result: matchingCancelledBaseline.result,
            safetyResult: matchingCancelledBaseline.safetyResult,
          }
        : {
            result: selectedPresentationResult,
            safetyResult: selectedPresentationSafetyResult,
          },
    )
    setLastBatchStatus(null)
    setActiveBatch(next)
    return id
  }, [cancelledBaseline, readSafetyGenerationSlot, readSummaryGenerationSlot, resolvedModelName, safetyGenerationSlotKey, scopeKey, selectedPresentationResult, selectedPresentationSafetyResult, summaryGenerationSlotKey])

  const runPipelines = useCallback(async (
    jobs: GenerationPipeline[],
    isCancelled: () => boolean,
  ) => {
    if (model === CUSTOM_OPENAI_MODEL_ID) {
      // A small local model commonly runs on one GPU/CPU worker. Starting the
      // two large structured prompts together makes one request queue behind
      // the other (or forces both to compete for memory), which used to trip
      // the cloud-oriented idle watchdog. Run local summary jobs one at a time;
      // cloud providers can continue to execute them concurrently.
      for (const job of jobs) {
        if (isCancelled()) break
        await job.run().catch(() => undefined)
      }
      return
    }
    await Promise.allSettled(jobs.map((job) => (
      isCancelled() ? Promise.resolve() : job.run()
    )))
  }, [model])

  const markManualPipelineStarted = useCallback((
    batchId: string,
    kind: GenerationPipeline['kind'],
  ) => {
    const current = activeBatchRef.current
    if (!current || current.id !== batchId) return
    const next: ActiveGenerationBatch = kind === 'summary'
      ? { ...current, summaryStarted: true }
      : { ...current, safetyStarted: true }
    activeBatchRef.current = next
    setActiveBatch(next)
  }, [])

  const runManualBatch = useCallback(async (jobs: GenerationPipeline[]) => {
    const batchScopeKey = scopeKey
    const batchId = beginBatch({
      summary: jobs.some((job) => job.kind === 'summary'),
      safety: jobs.some((job) => job.kind === 'safety'),
    })
    manualBatchIdsRef.current.add(batchId)
    setManualBatchCounts((current) => ({
      ...current,
      [batchScopeKey]: (current[batchScopeKey] ?? 0) + 1,
    }))
    try {
      await runPipelines(
        jobs.map((job) => ({
          ...job,
          run: async () => {
            // The local path is intentionally sequential, so an expected safety
            // slot may contain stale state for a long time before its new job
            // really begins. Mark ownership at the exact invocation boundary.
            markManualPipelineStarted(batchId, job.kind)
            await job.run()
          },
        })),
        () => cancelledBatchIdsRef.current.has(batchId),
      )
    } finally {
      manualBatchIdsRef.current.delete(batchId)
      cancelledBatchIdsRef.current.delete(batchId)
      cancelledScopeKeysRef.current.delete(batchScopeKey)
      setCancellingScopeKey((current) => (
        current === batchScopeKey ? null : current
      ))
      setManualBatchCounts((current) => {
        const remaining = Math.max(0, (current[batchScopeKey] ?? 0) - 1)
        if (remaining > 0) return { ...current, [batchScopeKey]: remaining }
        const next = { ...current }
        delete next[batchScopeKey]
        return next
      })
    }
  }, [beginBatch, markManualPipelineStarted, runPipelines, scopeKey])

  const generate = useCallback(async () => {
    await runManualBatch([
      { kind: 'summary', run: generateSummary },
      { kind: 'safety', run: generateSafety },
    ])
  }, [generateSafety, generateSummary, runManualBatch])

  const cancelGeneration = useCallback(() => {
    if (!scopeKey) return
    cancelledScopeKeysRef.current.add(scopeKey)
    setCancellingScopeKey(scopeKey)

    const current = activeBatchRef.current
    if (current?.scopeKey === scopeKey && !current.cancelled) {
      cancelledBatchIdsRef.current.add(current.id)
      const cancelledBatch = { ...current, cancelled: true }
      activeBatchRef.current = cancelledBatch
      setActiveBatch(cancelledBatch)
    }

    // Summary and safety own independent useUnifiedAi instances. Stopping the
    // user-facing batch must abort every expected half, including an auto
    // pipeline that is still waiting for hydration.
    if (!current || current.scopeKey !== scopeKey || current.expectsSummary) {
      cancelSummary(
        current?.scopeKey === scopeKey
          ? current.summarySlotKey
          : summaryGenerationSlotKey,
      )
    }
    if (!current || current.scopeKey !== scopeKey || current.expectsSafety) {
      cancelSafety(
        current?.scopeKey === scopeKey
          ? current.safetySlotKey
          : safetyGenerationSlotKey,
      )
    }

    // A local sequential batch may have committed summary before safety began.
    // Restore that exact slot (and its encrypted cache) immediately; the
    // cancelled-baseline presentation below covers retained-model state until
    // the next complete batch succeeds.
    if (current?.scopeKey === scopeKey) {
      if (
        current.expectsSummary &&
        !Object.is(
          readSummaryGenerationSlot(current.summarySlotKey).result,
          current.summaryPreviousResult,
        )
      ) {
        restoreSummaryGenerationSlot(
          current.summarySlotKey,
          current.summaryPreviousResult,
        )
      }
      if (
        current.expectsSafety &&
        !Object.is(
          readSafetyGenerationSlot(current.safetySlotKey).result,
          current.safetyPreviousResult,
        )
      ) {
        restoreSafetyGenerationSlot(
          current.safetySlotKey,
          current.safetyPreviousResult,
        )
      }
    }
  }, [
    cancelSafety,
    cancelSummary,
    readSafetyGenerationSlot,
    readSummaryGenerationSlot,
    restoreSafetyGenerationSlot,
    restoreSummaryGenerationSlot,
    safetyGenerationSlotKey,
    scopeKey,
    summaryGenerationSlotKey,
  ])

  useEffect(() => {
    const cancelQueuedBundleWork = () => {
      const current = activeBatchRef.current
      // The slot hooks abort requests that already own a controller. The
      // orchestrator additionally tombstones EVERY manual batch, including a
      // background batch whose presentation ref was discarded after an
      // audience/data-scope switch. Its queued local safety job must never run
      // with the old Bundle closure after the stores reset.
      for (const batchId of manualBatchIdsRef.current) {
        cancelledBatchIdsRef.current.add(batchId)
      }
      if (current) {
        cancelledBatchIdsRef.current.add(current.id)
        cancelledScopeKeysRef.current.add(current.scopeKey)
        const cancelledBatch = current.cancelled
          ? current
          : { ...current, cancelled: true }
        activeBatchRef.current = cancelledBatch
        setActiveBatch(cancelledBatch)
      }
      if (!current && manualBatchIdsRef.current.size === 0) return
      cancelSummary(current?.summarySlotKey)
      cancelSafety(current?.safetySlotKey)
    }
    window.addEventListener(BUNDLE_CHANGED_EVENT, cancelQueuedBundleWork)
    return () => window.removeEventListener(BUNDLE_CHANGED_EVENT, cancelQueuedBundleWork)
  }, [cancelSafety, cancelSummary])

  // Retry only the failed/missing pipeline so a successful safety scan or
  // summary is not billed twice. It still belongs to one visible batch.
  const retryFailed = useCallback(async () => {
    const jobs: GenerationPipeline[] = []
    if (presentedSummaryError || !result) jobs.push({ kind: 'summary', run: generateSummary })
    if (presentedSafetyError || !safetyResult) jobs.push({ kind: 'safety', run: generateSafety })
    if (jobs.length === 0) {
      jobs.push(
        { kind: 'summary', run: generateSummary },
        { kind: 'safety', run: generateSafety },
      )
    }
    await runManualBatch(jobs)
  }, [generateSafety, generateSummary, presentedSafetyError, presentedSummaryError, result, runManualBatch, safetyResult])

  // Keep a manual local-model batch active across the intentional gap between
  // sequential summary and safety jobs. Otherwise the newly generated summary
  // could briefly publish beside the previous safety scan.
  const manualBatchRunning = Boolean(manualBatchCounts[scopeKey])
  const presentedActiveBatch = activeBatch?.scopeKey === scopeKey ? activeBatch : null
  // Summary and safety auto-runs are initiated by independently hydrated
  // hooks. Keep one atomic batch alive across the short false gap where the
  // first pipeline has settled but the second has not started yet.
  const awaitingCoordinatedAutoPipeline = Boolean(
    presentedActiveBatch?.coordinatedAuto &&
    !presentedActiveBatch.cancelled &&
    effectiveAutoGenerate &&
    (
      (
        presentedActiveBatch.expectsSummary &&
        !presentedActiveBatch.summaryStarted &&
        !presentedActiveBatch.summarySettled
      ) ||
      (
        presentedActiveBatch.expectsSafety &&
        !presentedActiveBatch.safetyStarted &&
        !presentedActiveBatch.safetySettled
      )
    )
  )
  const isGenerating = manualBatchRunning ||
    isSummaryGenerating ||
    isSafetyGenerating ||
    awaitingCoordinatedAutoPipeline

  // Auto-generation is still initiated by the two guarded hooks. Detect those
  // transitions here so automatic and manual runs share the same lifecycle.
  useEffect(() => {
    let currentBatch = activeBatchRef.current
    if (currentBatch?.scopeKey === scopeKey) {
      const summarySlot = currentBatch.expectsSummary
        ? readSummaryGenerationSlot(currentBatch.summarySlotKey)
        : null
      const safetySlot = currentBatch.expectsSafety
        ? readSafetyGenerationSlot(currentBatch.safetySlotKey)
        : null
      const summaryStarted = currentBatch.summaryStarted || Boolean(summarySlot?.isRunning)
      const safetyStarted = currentBatch.safetyStarted || Boolean(safetySlot?.isRunning)
      let summarySettled = currentBatch.summarySettled
      let safetySettled = currentBatch.safetySettled
      let summarySucceeded = currentBatch.summarySucceeded
      let safetySucceeded = currentBatch.safetySucceeded
      let summaryOutcomeError = currentBatch.summaryOutcomeError
      let safetyOutcomeError = currentBatch.safetyOutcomeError
      let summaryOutcomeIssue = currentBatch.summaryOutcomeIssue
      let safetyOutcomeIssue = currentBatch.safetyOutcomeIssue

      if (currentBatch.expectsSummary && !summarySettled && !summarySlot?.isRunning) {
        const hasFreshResult = Boolean(
          summarySlot?.result && !Object.is(summarySlot.result, batchBaseline.result),
        )
        if (summaryStarted) {
          if (summarySlot?.error || summarySlot?.issue) {
            summarySettled = true
            summarySucceeded = false
            summaryOutcomeError = summarySlot.error ?? 'PARSE_FAILED'
            summaryOutcomeIssue = summarySlot.issue
          } else if (hasFreshResult) {
            summarySettled = true
            summarySucceeded = true
          } else {
            summarySettled = true
            summarySucceeded = false
            summaryOutcomeError = 'PARSE_FAILED'
          }
        } else if (
          currentBatch.coordinatedAuto &&
          hasFreshResult &&
          !summarySlot?.error &&
          !summarySlot?.issue
        ) {
          // A separately hydrated cache may satisfy an expected auto pipeline
          // without starting a network run.
          summarySettled = true
          summarySucceeded = true
        }
      }
      if (currentBatch.expectsSafety && !safetySettled && !safetySlot?.isRunning) {
        const hasFreshResult = Boolean(
          safetySlot?.result && !Object.is(safetySlot.result, batchBaseline.safetyResult),
        )
        if (safetyStarted) {
          if (safetySlot?.error || safetySlot?.issue) {
            safetySettled = true
            safetySucceeded = false
            safetyOutcomeError = safetySlot.error ?? 'PARSE_FAILED'
            safetyOutcomeIssue = safetySlot.issue
          } else if (hasFreshResult) {
            safetySettled = true
            safetySucceeded = true
          } else {
            safetySettled = true
            safetySucceeded = false
            safetyOutcomeError = 'PARSE_FAILED'
          }
        } else if (
          currentBatch.coordinatedAuto &&
          hasFreshResult &&
          !safetySlot?.error &&
          !safetySlot?.issue
        ) {
          safetySettled = true
          safetySucceeded = true
        }
      }

      const progressedBatch: ActiveGenerationBatch = {
        ...currentBatch,
        summaryStarted,
        safetyStarted,
        summarySettled,
        safetySettled,
        summarySucceeded,
        safetySucceeded,
        summaryOutcomeError,
        safetyOutcomeError,
        summaryOutcomeIssue,
        safetyOutcomeIssue,
      }
      const progressChanged =
        summaryStarted !== currentBatch.summaryStarted ||
        safetyStarted !== currentBatch.safetyStarted ||
        summarySettled !== currentBatch.summarySettled ||
        safetySettled !== currentBatch.safetySettled ||
        summarySucceeded !== currentBatch.summarySucceeded ||
        safetySucceeded !== currentBatch.safetySucceeded ||
        summaryOutcomeError !== currentBatch.summaryOutcomeError ||
        safetyOutcomeError !== currentBatch.safetyOutcomeError ||
        summaryOutcomeIssue !== currentBatch.summaryOutcomeIssue ||
        safetyOutcomeIssue !== currentBatch.safetyOutcomeIssue
      if (progressChanged) {
        activeBatchRef.current = progressedBatch
        setActiveBatch(progressedBatch)
        currentBatch = progressedBatch
      }
    }
    if (currentBatch && currentBatch.scopeKey !== scopeKey) {
      // A request from another Bundle/audience/locale/input may still finish
      // in its own cache slot, but it no longer owns this screen. Discard its
      // presentation batch before considering current-scope busy state.
      activeBatchRef.current = null
      setBatchBaseline({ result, safetyResult })
      setActiveBatch(null)
      setLastBatchStatus(null)
      currentBatch = null
    }
    if (isGenerating) {
      // stop() may need one render for the provider promises and store running
      // flags to settle. Do not create a replacement batch/timer during that
      // drain window.
      if (cancelledScopeKeysRef.current.has(scopeKey)) return
      const coordinateAuto = !manualBatchRunning && effectiveAutoGenerate
      const selectedSummarySlot = readSummaryGenerationSlot(summaryGenerationSlotKey)
      const selectedSafetySlot = readSafetyGenerationSlot(safetyGenerationSlotKey)
      beginBatch({
        summary: isCurrentSummarySlotGenerating || (
          coordinateAuto && !selectedSummarySlot.result
        ),
        safety: isCurrentSafetySlotGenerating || (
          coordinateAuto && !selectedSafetySlot.result
        ),
        coordinatedAuto: coordinateAuto,
        summaryStarted: isCurrentSummarySlotGenerating,
        safetyStarted: isCurrentSafetySlotGenerating,
      })
      return
    }
    const completedBatch = currentBatch
    if (
      cancelledScopeKeysRef.current.has(scopeKey) ||
      completedBatch?.cancelled
    ) {
      cancelledScopeKeysRef.current.delete(scopeKey)
      if (completedBatch) cancelledBatchIdsRef.current.delete(completedBatch.id)
      activeBatchRef.current = null
      // Preserve the last complete, internally consistent pair. One local
      // pipeline may already have committed before the user stopped the next
      // sequential request; publishing that half would recreate the exact
      // "new summary + old safety" state this orchestrator prevents.
      const preservedBaseline = completedBatch
        ? batchBaseline
        : {
            result: selectedPresentationResult,
            safetyResult: selectedPresentationSafetyResult,
          }
      setCancelledBaseline({
        scopeKey,
        summarySlotKey: completedBatch?.summarySlotKey ?? summaryGenerationSlotKey,
        safetySlotKey: completedBatch?.safetySlotKey ?? safetyGenerationSlotKey,
        ...preservedBaseline,
      })
      setBatchBaseline(preservedBaseline)
      setActiveBatch(null)
      setLastBatchStatus(null)
      setCancellingScopeKey(null)
      return
    }
    if (!completedBatch) return
    activeBatchRef.current = null
    const completedSummarySlot = completedBatch.expectsSummary
      ? readSummaryGenerationSlot(completedBatch.summarySlotKey)
      : null
    const summaryFailed = completedBatch.expectsSummary && (
      !completedBatch.summarySettled || !completedBatch.summarySucceeded
    )
    const safetyFailed = completedBatch.expectsSafety && (
      !completedBatch.safetySettled || !completedBatch.safetySucceeded
    )
    if (!summaryFailed && !safetyFailed) {
      setCancelledBaseline((current) => (
        current?.scopeKey === completedBatch.scopeKey &&
        current.summarySlotKey === completedBatch.summarySlotKey &&
        current.safetySlotKey === completedBatch.safetySlotKey
          ? null
          : current
      ))
    }
    // Persist the captured slots' settled status even on success. This keeps a
    // stale error in the newly selected picker slot from being mistaken for
    // the outcome of the batch that actually just finished.
    setLastBatchStatus({
      scopeKey: completedBatch.scopeKey,
      summarySlotKey: completedBatch.summarySlotKey,
      safetySlotKey: completedBatch.safetySlotKey,
      summaryError: summaryFailed
        ? completedBatch.summaryOutcomeError ?? 'PARSE_FAILED'
        : null,
      safetyError: safetyFailed
        ? completedBatch.safetyOutcomeError ?? 'PARSE_FAILED'
        : null,
      summaryIssue: summaryFailed ? completedBatch.summaryOutcomeIssue : null,
      safetyIssue: safetyFailed ? completedBatch.safetyOutcomeIssue : null,
    })
    const completedGeneration = completedSummarySlot?.result?.generation
    const baselineGeneration = batchBaseline.result?.generation
    if (
      !summaryFailed &&
      !safetyFailed &&
      completedBatch.expectsSummary &&
      completedBatch.summaryStarted &&
      completedGeneration?.source === 'live' &&
      (
        baselineGeneration?.source !== 'live' ||
        baselineGeneration.generatedAt !== completedGeneration.generatedAt
      )
    ) {
      const durationMs = Math.round(Math.max(
        0,
        monotonicNow() - completedBatch.startedAtMonotonic,
      ))
      const completedAt = Math.max(Date.now(), completedGeneration.generatedAt)
      const timing = {
        scopeKey: completedBatch.scopeKey,
        generatedAt: completedGeneration.generatedAt,
        modelId: completedGeneration.modelId,
        completedAt,
        durationMs,
      }
      setLastCompletedTiming(timing)
      recordGenerationCompletion({
        slotKey: completedBatch.summarySlotKey,
        generatedAt: timing.generatedAt,
        modelId: timing.modelId,
        completedAt: timing.completedAt,
        durationMs: timing.durationMs,
      })
    }
    setBatchBaseline({ result, safetyResult })
    setActiveBatch(null)
    setLastCompletedBatchId(completedBatch.id)
  }, [
    batchBaseline,
    beginBatch,
    cancellingScopeKey,
    isCurrentSafetySlotGenerating,
    isCurrentSummarySlotGenerating,
    isGenerating,
    effectiveAutoGenerate,
    manualBatchRunning,
    readSafetyGenerationSlot,
    readSummaryGenerationSlot,
    recordGenerationCompletion,
    result,
    safetyGenerationSlotKey,
    safetyResult,
    scopeKey,
    selectedPresentationResult,
    selectedPresentationSafetyResult,
    summaryGenerationSlotKey,
  ])

  const setModel = useCallback((id: string) => {
    // A cancelled batch preserves its prior complete pair for the model that
    // owned that attempt. Once the user deliberately selects another model,
    // let the slot hooks restore that model's saved version (or their normal
    // last-visible fallback) instead of letting the cancellation baseline
    // permanently mask all model-specific results in this scope.
    setCancelledBaseline(null)
    setLastBatchStatus(null)
    setSummaryModel(id)
    setSafetyModel(id)
  }, [setSafetyModel, setSummaryModel])

  const setAutoGenerate = useCallback((value: boolean) => {
    if (autoAiConsent.source === 'local') {
      // A real/demo import transition has closed the gate but has not yet
      // published its Bundle. Ignore controls still visible for the previous
      // patient; they must not make the new scope answerable early.
      if (autoAiConsent.decision === 'preparing') return
      if (value && autoAiConsent.decision !== 'auto') {
        // Turning auto-run on for a local Bundle reopens the same contextual
        // confirmation. Do not flip the persisted preference until it is
        // accepted, or the old preference could race the dialog.
        const pending = startLocalImportAiConsent(autoAiConsent.importId ?? generateId())
        if (pending) markLocalImportAiConsentReady(pending.importId)
        return
      }
      if (!value && autoAiConsent.importId) {
        recordLocalImportAiDecision(autoAiConsent.importId, 'manual')
      }
      return
    }
    if (autoAiConsent.source === 'demo') {
      // Demo snapshots are source-driven and must not alter SMART preferences.
      return
    }
    // SMART/other real data keeps the browser-wide preference.
    recordAutoAiRealDataDecision(value ? 'auto' : 'manual')
    setSummaryAutoGenerate(value)
    setAutoScan(value)
  }, [autoAiConsent, setAutoScan, setSummaryAutoGenerate])

  const preferencesSynced = safetyModel === model && autoScan === autoGenerate
  const isRestoring = hasPatient && dataReady && (
    !isSummaryHydrated || !isSafetyHydrated || !preferencesSynced
  )
  const presentedBatch = presentedActiveBatch
  const presentedBatchOwnsSelectedSlots = Boolean(
    presentedBatch &&
    presentedBatch.summarySlotKey === summaryGenerationSlotKey &&
    presentedBatch.safetySlotKey === safetyGenerationSlotKey,
  )
  const scopedCancelledBaseline =
    cancelledBaseline?.scopeKey === scopeKey &&
    cancelledBaseline.summarySlotKey === summaryGenerationSlotKey &&
    cancelledBaseline.safetySlotKey === safetyGenerationSlotKey
      ? cancelledBaseline
      : null

  // Cache hydration for summary and safety completes independently. Remember
  // only a pair with one proven owner so a model switch can never briefly show
  // model B's summary beside model A's safety scan. A background batch for a
  // different picker model does not prevent the selected model from becoming
  // the stable visible pair.
  useEffect(() => {
    if (!currentModelPair || presentedBatchOwnsSelectedSlots) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastCoherentModelPair((current) => {
      if (
        current?.scopeKey === currentModelPair.scopeKey &&
        current.ownerRuntimeId === currentModelPair.ownerRuntimeId &&
        Object.is(current.result, currentModelPair.result) &&
        Object.is(current.safetyResult, currentModelPair.safetyResult)
      ) return current
      return currentModelPair
    })
  }, [currentModelPair, presentedBatchOwnsSelectedSlots])

  const presentedResultBase = presentedBatchOwnsSelectedSlots
    ? batchBaseline.result
    : scopedCancelledBaseline
      ? scopedCancelledBaseline.result
      : selectedPresentationResult
  const presentedResult = useMemo(() => {
    if (
      presentedResultBase?.generation?.source !== 'live' ||
      !lastCompletedTiming ||
      lastCompletedTiming.scopeKey !== scopeKey ||
      presentedResultBase.generation.generatedAt !== lastCompletedTiming.generatedAt ||
      presentedResultBase.generation.modelId !== lastCompletedTiming.modelId ||
      (
        presentedResultBase.generation.completedAt === lastCompletedTiming.completedAt &&
        presentedResultBase.generation.durationMs === lastCompletedTiming.durationMs
      )
    ) return presentedResultBase
    return {
      ...presentedResultBase,
      generation: {
        ...presentedResultBase.generation,
        completedAt: lastCompletedTiming.completedAt,
        durationMs: lastCompletedTiming.durationMs,
      },
    }
  }, [lastCompletedTiming, presentedResultBase, scopeKey])
  const presentedSafetyResult = presentedBatchOwnsSelectedSlots
    ? batchBaseline.safetyResult
    : scopedCancelledBaseline
      ? scopedCancelledBaseline.safetyResult
      : selectedPresentationSafetyResult
  const contextOverflowIssue = [presentedSummaryIssue, presentedSafetyIssue]
    .filter((issue): issue is NonNullable<typeof issue> => issue?.kind === 'context-overflow')
    .sort((left, right) => right.overBy - left.overBy)[0] ?? null

  return {
    result: presentedResult,
    safetyResult: presentedSafetyResult,
    coverage,
    hasPatient,
    dataReady,
    model,
    autoGenerate: effectiveAutoGenerate,
    setModel,
    setAutoGenerate,
    generate,
    cancelGeneration,
    retryFailed,
    isGenerating,
    isStopping: cancellingScopeKey === scopeKey,
    isSummaryGenerating,
    isSafetyGenerating,
    isRestoring,
    summaryError: presentedSummaryError,
    safetyError: presentedSafetyError,
    summaryIssue: presentedSummaryIssue,
    safetyIssue: presentedSafetyIssue,
    contextOverflowIssue,
    hasAnyResult: Boolean(presentedResult || presentedSafetyResult),
    hasCompleteResult: Boolean(presentedResult && presentedSafetyResult),
    resolveSafetySource,
    activeGeneration: presentedBatch && !presentedBatch.cancelled ? {
      id: presentedBatch.id,
      modelName: presentedBatch.modelName,
      startedAt: presentedBatch.startedAt,
    } : null,
    activeBatchId: presentedBatch?.id ?? null,
    lastCompletedBatchId,
  }
}
