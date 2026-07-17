// Medical Summary orchestration layer. The structured summary and safety scan
// remain independently validated AI pipelines, but the product exposes one
// generation lifecycle, one model/auto preference, and one restore state.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMedicalSummary } from './use-medical-summary.hook'
import { useSafetyAlerts } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

function createBatchId(sequence: number) {
  return `${Date.now().toString(36)}-${sequence.toString(36)}`
}

export function useMedicalSummaryOrchestrator() {
  const {
    result,
    coverage,
    isGenerating: isSummaryGenerating,
    error: summaryError,
    hasPatient,
    dataReady,
    isHydrated: isSummaryHydrated,
    autoGenerate,
    setAutoGenerate: setSummaryAutoGenerate,
    model,
    setModel: setSummaryModel,
    generate: generateSummary,
  } = useMedicalSummary()
  const {
    result: safetyResult,
    isScanning: isSafetyGenerating,
    error: safetyError,
    isHydrated: isSafetyHydrated,
    autoScan,
    setAutoScan,
    model: safetyModel,
    setModel: setSafetyModel,
    scan: generateSafety,
    resolveSource: resolveSafetySource,
  } = useSafetyAlerts()
  const sequenceRef = useRef(0)
  const activeBatchRef = useRef<string | null>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [lastCompletedBatchId, setLastCompletedBatchId] = useState<string | null>(null)
  const [batchBaseline, setBatchBaseline] = useState({ result, safetyResult })

  // Historical preferences lived in two stores. The summary preference is the
  // source of truth; after this one-way migration all user-facing controls
  // update both stores together.
  useEffect(() => {
    if (safetyModel !== model) setSafetyModel(model)
  }, [model, safetyModel, setSafetyModel])
  useEffect(() => {
    if (autoScan !== autoGenerate) setAutoScan(autoGenerate)
  }, [autoGenerate, autoScan, setAutoScan])

  const beginBatch = useCallback(() => {
    if (activeBatchRef.current) return activeBatchRef.current
    sequenceRef.current += 1
    const id = createBatchId(sequenceRef.current)
    activeBatchRef.current = id
    // Keep the last complete briefing visible throughout a refresh. New
    // summary/safety responses publish together when the batch settles, so the
    // page never mixes one newly generated half with one stale half.
    setBatchBaseline({ result, safetyResult })
    setActiveBatchId(id)
    return id
  }, [result, safetyResult])

  const runPipelines = useCallback(async (jobs: Array<() => Promise<void>>) => {
    if (model === CUSTOM_OPENAI_MODEL_ID) {
      // A small local model commonly runs on one GPU/CPU worker. Starting the
      // two large structured prompts together makes one request queue behind
      // the other (or forces both to compete for memory), which used to trip
      // the cloud-oriented idle watchdog. Run local summary jobs one at a time;
      // cloud providers can continue to execute them concurrently.
      for (const job of jobs) {
        await job().catch(() => undefined)
      }
      return
    }
    await Promise.allSettled(jobs.map((job) => job()))
  }, [model])

  const generate = useCallback(async () => {
    beginBatch()
    await runPipelines([generateSummary, generateSafety])
  }, [beginBatch, generateSafety, generateSummary, runPipelines])

  // Retry only the failed/missing pipeline so a successful safety scan or
  // summary is not billed twice. It still belongs to one visible batch.
  const retryFailed = useCallback(async () => {
    beginBatch()
    const jobs: Array<() => Promise<void>> = []
    if (summaryError || !result) jobs.push(generateSummary)
    if (safetyError || !safetyResult) jobs.push(generateSafety)
    if (jobs.length === 0) jobs.push(generateSummary, generateSafety)
    await runPipelines(jobs)
  }, [beginBatch, generateSafety, generateSummary, result, runPipelines, safetyError, safetyResult, summaryError])

  const isGenerating = isSummaryGenerating || isSafetyGenerating

  // Auto-generation is still initiated by the two guarded hooks. Detect those
  // transitions here so automatic and manual runs share the same lifecycle.
  useEffect(() => {
    if (isGenerating) {
      beginBatch()
      return
    }
    const completed = activeBatchRef.current
    if (!completed) return
    activeBatchRef.current = null
    setBatchBaseline({ result, safetyResult })
    setActiveBatchId(null)
    setLastCompletedBatchId(completed)
  }, [beginBatch, isGenerating, result, safetyResult])

  const setModel = useCallback((id: string) => {
    setSummaryModel(id)
    setSafetyModel(id)
  }, [setSafetyModel, setSummaryModel])

  const setAutoGenerate = useCallback((value: boolean) => {
    setSummaryAutoGenerate(value)
    setAutoScan(value)
  }, [setAutoScan, setSummaryAutoGenerate])

  const preferencesSynced = safetyModel === model && autoScan === autoGenerate
  const isRestoring = hasPatient && dataReady && (
    !isSummaryHydrated || !isSafetyHydrated || !preferencesSynced
  )
  const presentedResult = isGenerating && activeBatchId
    ? batchBaseline.result
    : result
  const presentedSafetyResult = isGenerating && activeBatchId
    ? batchBaseline.safetyResult
    : safetyResult

  return {
    result: presentedResult,
    safetyResult: presentedSafetyResult,
    coverage,
    hasPatient,
    dataReady,
    model,
    autoGenerate,
    setModel,
    setAutoGenerate,
    generate,
    retryFailed,
    isGenerating,
    isSummaryGenerating,
    isSafetyGenerating,
    isRestoring,
    summaryError,
    safetyError,
    hasAnyResult: Boolean(presentedResult || presentedSafetyResult),
    hasCompleteResult: Boolean(presentedResult && presentedSafetyResult),
    resolveSafetySource,
    activeBatchId,
    lastCompletedBatchId,
  }
}
