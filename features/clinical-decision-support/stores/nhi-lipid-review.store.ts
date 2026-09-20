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

export type NhiLipidAnswer = 'yes' | 'no' | 'unknown'
export type NhiLipidAnswers = Readonly<Record<string, NhiLipidAnswer>>
export interface NhiLipidAnswerProvenance {
  source: 'manual' | 'ai'
  modelId?: string
  modelName?: string
  generatedAt?: string
  confidence?: 'high' | 'medium' | 'low'
}
export type NhiLipidAnswerProvenanceById = Readonly<Record<string, NhiLipidAnswerProvenance>>
const EMPTY: NhiLipidAnswers = Object.freeze({})
const EMPTY_PROVENANCE: NhiLipidAnswerProvenanceById = Object.freeze({})

interface ReviewState {
  patientId?: string
  answers: NhiLipidAnswers
  provenance: NhiLipidAnswerProvenanceById
  activate: (patientId: string | undefined) => void
  clear: (patientId: string) => void
  answer: (
    patientId: string,
    id: string,
    value: NhiLipidAnswer | undefined,
    provenance?: NhiLipidAnswerProvenance,
  ) => void
}
export const useNhiLipidReviewStore = create<ReviewState>((set) => ({
  answers: EMPTY,
  provenance: EMPTY_PROVENANCE,
  activate: (patientId) => set((state) => (
    state.patientId === patientId ? state : { patientId, answers: EMPTY, provenance: EMPTY_PROVENANCE }
  )),
  clear: (patientId) => set((state) => (
    state.patientId === patientId ? { answers: EMPTY, provenance: EMPTY_PROVENANCE } : state
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
