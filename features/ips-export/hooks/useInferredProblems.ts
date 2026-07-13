"use client"

// IPS Phase 2.2b — async side-channel hook for LLM problem-list inference.
//
// This is deliberately ISOLATED from the synchronous pure IPS pipeline
// (useIpsBundle). It runs the engine on demand, holds the resulting suggestions
// + the user's per-item confirmations, and exposes only CONFIRMED rows for the
// caller to merge back. Nothing here mutates the React Query cache or the pure
// bundle path — confirmed rows are turned into synthetic conditions by the
// caller (inferredToCondition) and merged via useIpsBundle(extraConditions).
//
// Two run paths behind the single run():
//   Path A (帶入醫療摘要): when a MEDICAL-audience Medical Summary already
//     exists for this patient, its problem list is mapped into candidates
//     (deterministic, text-only — no codes generated).
//   Path B: no summary yet → the original full evidence-digest inference,
//     whose prompt shares the same problem-inference semantics as the summary
//     (problem-inference-principles.ts).
// Both paths land in the SAME review list; candidates are never auto-checked.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useMedicalSummaryPeek } from '@/src/application/hooks/medical-summary/medical-summary-peek'
import { toast } from 'sonner'
import { useLanguage } from '@/src/application/providers/language.provider'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getUserErrorMessage } from '@/src/core/errors'
import { runProblemInference, type InferenceLlm } from '../utils/inference-engine'
import { mapSummaryProblemsToIpsCandidates } from '../utils/summary-problems-mapper'
import { buildEncounterIcdCandidates } from '../utils/encounter-icd-candidates'
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
  /** Bulk check/uncheck every current suggestion (全選 / 取消全選). */
  setAllConfirmed: (checked: boolean) => void
  /** Run Path A (import from summary) when a summary exists, else Path B. */
  run: () => Promise<void>
  /** Deterministic (no-AI) import of the last 6 months of visit ICD-10 codes as
   *  review candidates. Never needs an API key. */
  importEncounterIcds: () => void
  /** Withdraw the imported visit-ICD rows (the import button's toggle state). */
  removeEncounterIcds: () => void
  /** Withdraw the AI/summary rows (companion to 重新產生). */
  removeAiProblems: () => void
  /** De-duplicated count of recent visit ICD codes available to import — drives
   *  the trigger button label. 0 hides the button. */
  encounterIcdCount: number
  /** Clear suggestions + confirmations back to the idle state. */
  reset: () => void
  /** The confirmed suggestions (stable subset of `problems`). */
  confirmed: InferredProblem[]
  /** Whether an LLM is usable (API key present or chat proxy configured). */
  available: boolean
  /** User-facing error message when status === 'error'. */
  error: string | null
  /** >0 when a medical-audience summary with problems exists for this patient
   *  — run() will import those instead of running a fresh inference, and the
   *  trigger button should say so. */
  summaryProblemCount: number
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
  const { locale, t } = useLanguage()

  const [status, setStatus] = useState<InferenceStatus>('idle')
  const [problems, setProblems] = useState<InferredProblem[]>([])
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const available = computeAvailable(apiKey, geminiKey)

  // Read-only peek at the generated Medical Summary (medical audience, any
  // model slot). Slot keys are built from patient.id, so use that here too.
  const summary = useMedicalSummaryPeek(patient?.id ?? null)
  const summaryProblemCount = summary?.problems?.length ?? 0

  const toggleConfirm = useCallback((id: string) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Bulk 全選 / 取消全選 for the review list — a convenience over clicking each
  // row (a raw ICD import can be 30+ rows). The clinician still owns the export:
  // this only sets checkboxes; nothing reaches the bundle without a subsequent
  // deliberate export of the confirmed set.
  const setAllConfirmed = useCallback((checked: boolean) => {
    setConfirmedIds(checked ? new Set(problems.map((p) => p.id)) : new Set())
  }, [problems])

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
  // Patient.id is technically optional in FHIR — fall back to the first
  // identifier value so two id-less bundles still register as a change.
  const patientId = patient?.id ?? patient?.identifier?.[0]?.value ?? null
  const lastPatientIdRef = useRef(patientId)
  useEffect(() => {
    if (lastPatientIdRef.current === patientId) return
    lastPatientIdRef.current = patientId
    reset()
  }, [patientId, reset])

  // The two candidate sources (AI/summary vs visit-ICD) coexist in ONE review
  // list — rerunning a source replaces only ITS rows, keeping the other
  // source's rows and their check states (user feedback: importing ICDs must
  // not wipe AI suggestions, and vice versa). Visit-ICD ids are namespaced
  // 'encounter-icd:*', which is what the origin split keys on.
  const isIcdId = (id: string) => id.startsWith('encounter-icd:')
  const replaceOriginRows = useCallback(
    (originClass: 'ai' | 'icd', rows: InferredProblem[]) => {
      setProblems((prev) => {
        const kept = prev.filter((p) =>
          originClass === 'icd' ? p.origin !== 'encounter-icd' : p.origin === 'encounter-icd',
        )
        // AI/summary rows lead, visit ICDs follow.
        return originClass === 'icd' ? [...kept, ...rows] : [...rows, ...kept]
      })
      // Confirmations of the REPLACED class are dropped (its rows are new);
      // the surviving class keeps its check states.
      setConfirmedIds(
        (prev) => new Set([...prev].filter((id) => (originClass === 'icd' ? !isIcdId(id) : isIcdId(id)))),
      )
    },
    [],
  )

  // Path A — 帶入醫療摘要: purely deterministic mapping of the summary's
  // problem list into text-only candidates. No LLM call (the problem list
  // carries no codes), so it needs no API key and never fails.
  const runFromSummary = useCallback(async () => {
    if (!summary || (summary.problems?.length ?? 0) === 0) return

    setStatus('loading')
    setError(null)

    const candidates = mapSummaryProblemsToIpsCandidates(summary.problems, summary.sourceIndex)
    replaceOriginRows('ai', candidates)
    setStatus('ready')
    // This path is deterministic and instant — on a rerun the rows look
    // identical, which read as "the button did nothing". Announce completion.
    toast.success(
      t.ipsExport.inferredProblems.summaryImported.replace('{count}', String(candidates.length)),
    )
  }, [summary, replaceOriginRows, t])

  // Path B — original full inference over the evidence digest.
  const runInference = useCallback(async () => {
    if (!available) {
      setStatus('error')
      setError('no-key')
      return
    }
    if (!data) return

    setStatus('loading')
    setError(null)
    // Clear only the previous AI rows; visit-ICD rows (and their checks) stay.
    replaceOriginRows('ai', [])

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
      replaceOriginRows('ai', result)
      setStatus('ready')
    } catch (e) {
      setError(getUserErrorMessage(e))
      setStatus('error')
    }
  }, [available, data, query, replaceOriginRows])

  const run = useCallback(async () => {
    if (summaryProblemCount > 0) return runFromSummary()
    return runInference()
  }, [summaryProblemCount, runFromSummary, runInference])

  // Deterministic path — recent visit ICD-10 codes as review candidates. Pure,
  // no AI, no key. These are BILLING codes flagged 「非確診」 in the review UI and,
  // like every candidate, land UNCHECKED behind the same confirmation gate.
  const encounterIcdCandidates = useMemo<InferredProblem[]>(
    () =>
      data
        ? buildEncounterIcdCandidates(data.encounters ?? [], data.conditions ?? [], { locale })
        : [],
    [data, locale],
  )

  const importEncounterIcds = useCallback(() => {
    setStatus('ready')
    setError(null)
    // Merge: AI/summary rows (and their checks) survive an ICD import.
    replaceOriginRows('icd', encounterIcdCandidates)
  }, [encounterIcdCandidates, replaceOriginRows])

  // Symmetric withdraw (the import button toggles to 收回): drops the ICD rows
  // + their confirmations, leaves AI/summary rows untouched. Back to idle when
  // nothing remains so the panel reads pristine again.
  const removeEncounterIcds = useCallback(() => {
    replaceOriginRows('icd', [])
    if (!problems.some((p) => p.origin !== 'encounter-icd')) setStatus('idle')
  }, [problems, replaceOriginRows])

  // Same withdraw for the AI/summary side (shown next to 重新產生 once AI rows
  // exist): drops AI rows + their checks, leaves ICD rows untouched.
  const removeAiProblems = useCallback(() => {
    replaceOriginRows('ai', [])
    setError(null)
    if (!problems.some((p) => p.origin === 'encounter-icd')) setStatus('idle')
    else setStatus('ready')
  }, [problems, replaceOriginRows])

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
    setAllConfirmed,
    run,
    importEncounterIcds,
    removeEncounterIcds,
    removeAiProblems,
    encounterIcdCount: encounterIcdCandidates.length,
    reset,
    confirmed,
    available,
    error,
    summaryProblemCount,
  }
}
