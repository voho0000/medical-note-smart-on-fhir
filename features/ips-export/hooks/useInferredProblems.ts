"use client"

// IPS Phase 2.2b — async side-channel hook for LLM problem-list inference.
//
// This is deliberately ISOLATED from the synchronous pure IPS pipeline
// (useIpsBundle). It runs the engine on demand, holds the resulting suggestions
// + the user's per-item confirmations, and exposes only CONFIRMED rows for the
// caller to merge back. Nothing here mutates the React Query cache or the pure
// bundle path — confirmed rows are turned into synthetic conditions by the
// caller (inferredToCondition) and merged via useIpsBundle(extraConditions).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getUserErrorMessage } from '@/src/core/errors'
import { runProblemInference, type InferenceLlm } from '../utils/inference-engine'
import type { InferredProblem } from '../utils/inferred-problems-types'

export type InferenceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseInferredProblemsResult {
  status: InferenceStatus
  problems: InferredProblem[]
  /** Ids the user has checked for inclusion in the export. */
  confirmedIds: ReadonlySet<string>
  confirmedCount: number
  /** Toggle one suggestion's confirmation state. */
  toggleConfirm: (id: string) => void
  /** Run the inference engine against the currently loaded clinical data. */
  run: () => Promise<void>
  /** Clear suggestions + confirmations back to the idle state. */
  reset: () => void
  /** The confirmed suggestions (stable subset of `problems`). */
  confirmed: InferredProblem[]
  /** Whether an LLM is usable (API key present or chat proxy configured). */
  available: boolean
  /** User-facing error message when status === 'error'. */
  error: string | null
}

/** True when at least one LLM provider is usable. */
function computeAvailable(apiKey: string | null, geminiKey: string | null): boolean {
  return Boolean(apiKey || geminiKey || ENV_CONFIG.hasChatProxy)
}

export function useInferredProblems(): UseInferredProblemsResult {
  const { data } = useClinicalDataQuery()
  const { data: patient } = usePatientQuery()
  const { query } = useUnifiedAi()
  const { apiKey, geminiKey } = useAllApiKeys()

  const [status, setStatus] = useState<InferenceStatus>('idle')
  const [problems, setProblems] = useState<InferredProblem[]>([])
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const available = computeAvailable(apiKey, geminiKey)

  const toggleConfirm = useCallback((id: string) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setProblems([])
    setConfirmedIds(new Set())
    setError(null)
  }, [])

  // Suggestions are PATIENT-specific. The IPS tab is force-mounted so this
  // state survives tab switches — which means unmount no longer acts as an
  // implicit reset. The loaded patient's identity is the reset signal instead:
  // without it, confirmed AI problems from one patient could silently merge
  // into the next imported patient's export.
  const patientId = patient?.id ?? null
  const lastPatientIdRef = useRef(patientId)
  useEffect(() => {
    if (lastPatientIdRef.current === patientId) return
    lastPatientIdRef.current = patientId
    reset()
  }, [patientId, reset])

  const run = useCallback(async () => {
    if (!available) {
      setStatus('error')
      setError('no-key')
      return
    }
    if (!data) return

    setStatus('loading')
    setError(null)
    setProblems([])
    setConfirmedIds(new Set())

    // Wrap the unified-AI query as the engine's injected LLM. The engine
    // defensively swallows LLM failures (returns []), so we capture the error
    // here to distinguish "model failed" from "model found nothing".
    let llmError: unknown = null
    const llm: InferenceLlm = async (messages) => {
      try {
        return await query(messages, { responseFormat: 'json', temperature: 0.2 })
      } catch (e) {
        llmError = e
        throw e
      }
    }

    try {
      const result = await runProblemInference({ data, llm })
      if (llmError) {
        setError(getUserErrorMessage(llmError))
        setStatus('error')
        return
      }
      setProblems(result)
      setStatus('ready')
    } catch (e) {
      setError(getUserErrorMessage(e))
      setStatus('error')
    }
  }, [available, data, query])

  const confirmed = useMemo(
    () => problems.filter((p) => confirmedIds.has(p.id)),
    [problems, confirmedIds],
  )

  return {
    status,
    problems,
    confirmedIds,
    confirmedCount: confirmed.length,
    toggleConfirm,
    run,
    reset,
    confirmed,
    available,
    error,
  }
}
