/**
 * Visit-scoped answers for this patient's 表一 criteria, whether supplied by
 * AI evidence review or changed by a clinician.
 *
 * 表一 grades from conditions the cloud record cannot settle — 抽菸, 早發性冠心病
 * 家族史, 腰圍, 血管再通術, CAC — so the tier is a lower bound until evidence
 * review answers them. The answers are handed to the pack on the profile
 * (`nhiLipidReview`), so every module recomputes from them; nothing patches a
 * rendered card. Provenance stays alongside the pack-compatible answer map so
 * the UI can distinguish AI-filled rows from clinician corrections without
 * changing the clinical rules contract.
 *
 * Deliberately in memory only, unlike this app's other answer stores. Those
 * carry measurements and gradings; these are diagnostic assertions about a
 * named patient — 「做過繞道手術」, 「有抽菸」 — and writing them to browser
 * storage is a decision to be taken on its own, not one to arrive at by
 * following the nearest pattern. The cost is that a reload loses them, which is
 * the right way round: re-running AI or re-entering a correction is a smaller
 * harm than an assertion that outlives the visit.
 *
 * Switching patients clears the previous visit's answers, and every accessor is
 * keyed by patient so a late render of the previous chart cannot read them.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type {
  NhiLipidAiDecision,
  NhiLipidAiSuggestion,
} from '../ai/nhi-lipid-ai-assist'

export type NhiLipidAnswer = 'yes' | 'no' | 'unknown'
export type NhiLipidAnswers = Readonly<Record<string, NhiLipidAnswer>>
export interface NhiLipidAnswerProvenance {
  source: 'manual' | 'ai'
  /** The record-only value before AI or a clinician changed this criterion. */
  recordState?: NhiLipidAnswer
  /** A selection fills a record gap; a modification overrides record or AI. */
  manualAction?: 'selected' | 'modified' | 'reviewed'
  reviewedAt?: string
  overrides?: 'record' | 'ai'
  modelId?: string
  modelName?: string
  generatedAt?: string
  confidence?: 'high' | 'medium' | 'low'
  runId?: string
  inputSignature?: string
  sourceScopeSignature?: string
  promptVersion?: string
}
export type NhiLipidAnswerProvenanceById = Readonly<Record<string, NhiLipidAnswerProvenance>>
const EMPTY: NhiLipidAnswers = Object.freeze({})
const EMPTY_PROVENANCE: NhiLipidAnswerProvenanceById = Object.freeze({})

export interface NhiLipidAiRunMetadata {
  runId: string
  inputSignature: string
  sourceScopeSignature: string
  promptVersion: string
  startedAt: string
  completedAt?: string
  inputSummary?: { criteriaCount: number; sourceCount: number; sourceCounts: Record<string, number>; earliestDate?: string; latestDate?: string }
  /** Snapshot of the routed model while running; provider-reported model after completion. */
  modelId?: string
  modelName?: string
}

export interface NhiLipidAiReviewState {
  suggestions: Readonly<Record<string, NhiLipidAiSuggestion>>
  decisions: Readonly<Record<string, NhiLipidAiDecision>>
  isRunning: boolean
  error: string | null
  lastCompleted?: NhiLipidAiRunMetadata
  latestAttempt?: NhiLipidAiRunMetadata
}

const EMPTY_SUGGESTIONS: Readonly<Record<string, NhiLipidAiSuggestion>> = Object.freeze({})
const EMPTY_DECISIONS: Readonly<Record<string, NhiLipidAiDecision>> = Object.freeze({})
const EMPTY_AI_REVIEW: NhiLipidAiReviewState = Object.freeze({
  suggestions: EMPTY_SUGGESTIONS,
  decisions: EMPTY_DECISIONS,
  isRunning: false,
  error: null,
})

interface ReviewState {
  patientId?: string
  answers: NhiLipidAnswers
  provenance: NhiLipidAnswerProvenanceById
  aiReview: NhiLipidAiReviewState
  activate: (patientId: string | undefined) => void
  clear: (patientId: string) => void
  answer: (
    patientId: string,
    id: string,
    value: NhiLipidAnswer | undefined,
    provenance?: NhiLipidAnswerProvenance,
  ) => void
  beginAiRun: (patientId: string, metadata: NhiLipidAiRunMetadata) => void
  completeAiRun: (
    patientId: string,
    runId: string,
    suggestions: readonly NhiLipidAiSuggestion[],
    recordStates: Readonly<Record<string, NhiLipidAnswer>>,
    completedAt: string,
    completedModel?: { modelId: string; modelName: string },
  ) => void
  failAiRun: (patientId: string, runId: string, error: string) => void
  settleAiRun: (patientId: string, runId: string) => void
  invalidateAiReview: (
    patientId: string,
    inputSignature: string,
    sourceScopeSignature: string,
  ) => void
}
export const useNhiLipidReviewStore = create<ReviewState>((set) => ({
  answers: EMPTY,
  provenance: EMPTY_PROVENANCE,
  aiReview: EMPTY_AI_REVIEW,
  activate: (patientId) => set((state) => (
    state.patientId === patientId
      ? state
      : { patientId, answers: EMPTY, provenance: EMPTY_PROVENANCE, aiReview: EMPTY_AI_REVIEW }
  )),
  clear: (patientId) => set((state) => (
    state.patientId === patientId
      ? { answers: EMPTY, provenance: EMPTY_PROVENANCE, aiReview: EMPTY_AI_REVIEW }
      : state
  )),
  answer: (patientId, id, value, answerProvenance) => set((state) => {
    if (!patientId || state.patientId !== patientId) return state
    const answers = { ...state.answers }
    const provenance = { ...state.provenance }
    if (value === undefined) {
      delete answers[id]
      delete provenance[id]
    } else {
      answers[id] = value
      provenance[id] = answerProvenance ?? { source: 'manual' }
    }
    return { answers, provenance }
  }),
  beginAiRun: (patientId, metadata) => set((state) => {
    if (!patientId || state.patientId !== patientId) return state
    return {
      aiReview: {
        ...state.aiReview,
        isRunning: true,
        error: null,
        latestAttempt: metadata,
      },
    }
  }),
  completeAiRun: (patientId, runId, parsed, recordStates, completedAt, completedModel) => set((state) => {
    if (
      !patientId
      || state.patientId !== patientId
      || state.aiReview.latestAttempt?.runId !== runId
    ) return state

    // A completed run replaces the whole AI layer. Missing and unknown rows
    // therefore retire a prior AI answer, while clinician answers survive.
    const answers = { ...state.answers }
    const provenance = { ...state.provenance }
    for (const [criterionId, answerProvenance] of Object.entries(provenance)) {
      if (answerProvenance.source !== 'ai') continue
      delete answers[criterionId]
      delete provenance[criterionId]
    }

    const suggestions = Object.fromEntries(parsed.map((item) => [item.criterionId, item]))
    const decisions: Record<string, NhiLipidAiDecision> = {}
    const metadata = { ...state.aiReview.latestAttempt, completedAt, ...completedModel }
    for (const suggestion of parsed) {
      if (suggestion.state === 'unknown') continue
      if (provenance[suggestion.criterionId]?.source === 'manual') continue
      // Older visit answers predate provenance. The cross-repository contract
      // defines those as physician answers, so a rerun must preserve them too.
      if (
        Object.prototype.hasOwnProperty.call(answers, suggestion.criterionId)
        && !provenance[suggestion.criterionId]
      ) continue
      answers[suggestion.criterionId] = suggestion.state
      provenance[suggestion.criterionId] = {
        source: 'ai',
        recordState: recordStates[suggestion.criterionId],
        modelId: suggestion.modelId,
        modelName: suggestion.modelName,
        generatedAt: suggestion.generatedAt,
        confidence: suggestion.confidence,
        runId: metadata.runId,
        inputSignature: metadata.inputSignature,
        sourceScopeSignature: metadata.sourceScopeSignature,
        promptVersion: metadata.promptVersion,
      }
      decisions[suggestion.criterionId] = 'applied'
    }

    return {
      answers,
      provenance,
      aiReview: {
        suggestions,
        decisions,
        isRunning: false,
        error: null,
        latestAttempt: metadata,
        lastCompleted: metadata,
      },
    }
  }),
  failAiRun: (patientId, runId, error) => set((state) => {
    if (
      !patientId
      || state.patientId !== patientId
      || state.aiReview.latestAttempt?.runId !== runId
    ) return state
    return {
      aiReview: {
        ...state.aiReview,
        isRunning: false,
        error,
      },
    }
  }),
  settleAiRun: (patientId, runId) => set((state) => {
    if (
      !patientId
      || state.patientId !== patientId
      || state.aiReview.latestAttempt?.runId !== runId
    ) return state
    return {
      aiReview: {
        ...state.aiReview,
        isRunning: false,
      },
    }
  }),
  invalidateAiReview: (patientId, inputSignature, sourceScopeSignature) => set((state) => {
    if (!patientId || state.patientId !== patientId) return state
    const completed = state.aiReview.lastCompleted
    if (
      !completed
      || (completed.inputSignature === inputSignature
        && completed.sourceScopeSignature === sourceScopeSignature)
    ) return state
    const answers = { ...state.answers }
    const provenance = { ...state.provenance }
    for (const [criterionId, answerProvenance] of Object.entries(provenance)) {
      if (answerProvenance.source !== 'ai') continue
      delete answers[criterionId]
      delete provenance[criterionId]
    }
    return {
      answers,
      provenance,
      aiReview: EMPTY_AI_REVIEW,
    }
  }),
}))
export function useNhiLipidReview(patientId?: string): NhiLipidAnswers {
  const activate = useNhiLipidReviewStore((state) => state.activate)
  useEffect(() => { activate(patientId) }, [activate, patientId])
  return useNhiLipidReviewStore((state) => (
    state.patientId === patientId ? state.answers : EMPTY
  ))
}

export function useNhiLipidReviewProvenance(patientId?: string): NhiLipidAnswerProvenanceById {
  return useNhiLipidReviewStore((state) => (
    state.patientId === patientId ? state.provenance : EMPTY_PROVENANCE
  ))
}

export function useNhiLipidAiReview(patientId?: string): NhiLipidAiReviewState {
  return useNhiLipidReviewStore((state) => (
    state.patientId === patientId ? state.aiReview : EMPTY_AI_REVIEW
  ))
}
