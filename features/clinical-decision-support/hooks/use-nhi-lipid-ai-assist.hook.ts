'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { useEffectiveModel } from '@/src/application/stores/model-prefs.store'
import { getUserErrorMessage } from '@/src/core/errors'
import {
  modelContextLimit,
  modelDisplayLabel,
} from '@/src/shared/utils/model-access.utils'
import { resolveOpenAiCompatibleProfile } from '@/src/shared/utils/openai-compatible.utils'
import type { CdssCoverageCheck } from '../types'
import {
  buildNhiLipidAiMessages,
  parseNhiLipidAiResponse,
  type NhiLipidAiDecision,
  type NhiLipidAiSuggestion,
} from '../ai/nhi-lipid-ai-assist'

export interface NhiLipidAiAssist {
  suggestions: Readonly<Record<string, NhiLipidAiSuggestion>>
  decisions: Readonly<Record<string, NhiLipidAiDecision>>
  isRunning: boolean
  isDataReady: boolean
  error: string | null
  modelId: string
  modelName: string
  run: () => Promise<void>
  decide: (criterionId: string, decision: NhiLipidAiDecision) => void
}

const EMPTY_SUGGESTIONS: Readonly<Record<string, NhiLipidAiSuggestion>> = Object.freeze({})
const EMPTY_DECISIONS: Readonly<Record<string, NhiLipidAiDecision>> = Object.freeze({})

interface ReviewState {
  patientId?: string
  suggestions: Readonly<Record<string, NhiLipidAiSuggestion>>
  decisions: Readonly<Record<string, NhiLipidAiDecision>>
  isRunning: boolean
  error: string | null
}

const EMPTY_REVIEW: ReviewState = Object.freeze({
  suggestions: EMPTY_SUGGESTIONS,
  decisions: EMPTY_DECISIONS,
  isRunning: false,
  error: null,
})

/**
 * Manual, patient-scoped AI extraction for NHI Table 1. Results intentionally
 * live only in this mounted hook: they are not browser-persisted, never run on
 * chart load, and are cleared/cancelled when the patient changes.
 *
 * The visible AI action is the network entry point. The app's entry flow owns
 * disclosure of AI data use, so this review does not interrupt clinicians with
 * a second confirmation dialog.
 */
export function useNhiLipidAiAssist(input: {
  patientId?: string
  criteria: readonly CdssCoverageCheck[]
  locale: string
}): NhiLipidAiAssist {
  const modelId = useEffectiveModel('insights')
  const { openAiCompatibleProfiles } = useAllApiKeys()
  const openAiCompatible = useMemo(
    () => resolveOpenAiCompatibleProfile(modelId, openAiCompatibleProfiles),
    [modelId, openAiCompatibleProfiles],
  )
  const contextLimit = useMemo(
    () => modelContextLimit(modelId, openAiCompatible),
    [modelId, openAiCompatible],
  )
  const modelName = useMemo(
    () => modelDisplayLabel(modelId, openAiCompatible),
    [modelId, openAiCompatible],
  )
  // Leave headroom for the criteria, source catalog, JSON reply and provider
  // envelope. The shared input hook progressively reduces large records rather
  // than silently cutting a note or a laboratory series in half.
  const clinicalInput = useClinicalAiInput(contextLimit, 'insights', 0.62)
  const ai = useUnifiedAi()
  const stopAi = ai.stop
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW)
  const runIdRef = useRef(0)
  const operationKey = `nhi-lipid-ai:${input.patientId ?? 'none'}`
  // Key the visible state by patient rather than clearing it in an effect. A
  // patient switch therefore renders empty immediately, before any cleanup
  // effect runs, and a late reply can never appear on the next chart.
  const activeReview = review.patientId === input.patientId ? review : EMPTY_REVIEW

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      stopAi(operationKey)
    }
  }, [operationKey, stopAi])

  const isDataReady = Boolean(
    input.patientId
      && clinicalInput.patientId === input.patientId
      && clinicalInput.dataReady
      && clinicalInput.clinicalContext.trim(),
  )

  const run = useCallback(async () => {
    if (!input.patientId || !isDataReady || input.criteria.length === 0 || activeReview.isRunning) return

    const runId = ++runIdRef.current
    stopAi(operationKey)
    setReview({
      patientId: input.patientId,
      suggestions: EMPTY_SUGGESTIONS,
      decisions: EMPTY_DECISIONS,
      isRunning: true,
      error: null,
    })

    try {
      const messages = buildNhiLipidAiMessages({
        criteria: input.criteria,
        clinicalContext: clinicalInput.clinicalContext,
        catalog: clinicalInput.catalog,
        locale: input.locale,
      })
      const raw = await ai.query(messages, {
        modelId,
        maxTokens: 8_000,
        responseFormat: 'json',
        operationKey,
        diagnosticFeature: 'nhi-lipid-ai-assist',
      })
      if (runIdRef.current !== runId) return
      const parsed = parseNhiLipidAiResponse({
        raw,
        criteria: input.criteria,
        clinicalContext: clinicalInput.clinicalContext,
        catalog: clinicalInput.catalog,
        modelId,
        modelName,
      })
      if (!parsed) {
        setReview({
          patientId: input.patientId,
          suggestions: EMPTY_SUGGESTIONS,
          decisions: EMPTY_DECISIONS,
          isRunning: false,
          error: input.locale === 'en'
            ? 'The AI reply could not be verified. No Table 1 answers were changed.'
            : 'AI 回覆無法通過格式與證據核對；表一未做任何變更。',
        })
        return
      }
      setReview({
        patientId: input.patientId,
        suggestions: Object.fromEntries(parsed.map((suggestion) => [suggestion.criterionId, suggestion])),
        decisions: EMPTY_DECISIONS,
        isRunning: false,
        error: null,
      })
    } catch (caught) {
      if (runIdRef.current !== runId) return
      if (caught instanceof Error && caught.name === 'AbortError') return
      setReview({
        patientId: input.patientId,
        suggestions: EMPTY_SUGGESTIONS,
        decisions: EMPTY_DECISIONS,
        isRunning: false,
        error: getUserErrorMessage(caught),
      })
    } finally {
      if (runIdRef.current === runId) {
        setReview((current) => current.patientId === input.patientId
          ? { ...current, isRunning: false }
          : current)
      }
    }
  }, [
    ai,
    clinicalInput.catalog,
    clinicalInput.clinicalContext,
    input.criteria,
    input.locale,
    input.patientId,
    isDataReady,
    activeReview.isRunning,
    modelId,
    modelName,
    operationKey,
    stopAi,
  ])

  const decide = useCallback((criterionId: string, decision: NhiLipidAiDecision) => {
    setReview((current) => current.patientId === input.patientId
      ? { ...current, decisions: { ...current.decisions, [criterionId]: decision } }
      : current)
  }, [input.patientId])

  return {
    suggestions: activeReview.suggestions,
    decisions: activeReview.decisions,
    isRunning: activeReview.isRunning,
    isDataReady,
    error: activeReview.error,
    modelId,
    modelName,
    run,
    decide,
  }
}
