/**
 * What the clinician answered about this patient's 表一 criteria, this visit.
 *
 * 表一 grades from conditions the cloud record cannot settle — 抽菸, 早發性冠心病
 * 家族史, 腰圍, 血管再通術, CAC — so the tier is a lower bound until a person
 * answers. The answers are handed to the pack on the profile
 * (`nhiLipidReview`), so every module recomputes from them; nothing patches a
 * rendered card.
 *
 * Deliberately in memory only, unlike this app's other answer stores. Those
 * carry measurements and gradings; these are diagnostic assertions about a
 * named patient — 「做過繞道手術」, 「有抽菸」 — and writing them to browser
 * storage is a decision to be taken on its own, not one to arrive at by
 * following the nearest pattern. The cost is that a reload loses them, which is
 * the right way round: an answer a clinician has to give again is a smaller
 * harm than one that outlives the visit.
 *
 * Switching patients clears the previous visit's answers, and every accessor is
 * keyed by patient so a late render of the previous chart cannot read them.
 */
import { useEffect } from 'react'
import { create } from 'zustand'

export type NhiLipidAnswer = 'yes' | 'no' | 'unknown'
export type NhiLipidAnswers = Readonly<Record<string, NhiLipidAnswer>>
const EMPTY: NhiLipidAnswers = Object.freeze({})

interface ReviewState {
  patientId?: string
  answers: NhiLipidAnswers
  activate: (patientId: string | undefined) => void
  clear: (patientId: string) => void
  answer: (patientId: string, id: string, value: NhiLipidAnswer | undefined) => void
}
export const useNhiLipidReviewStore = create<ReviewState>((set) => ({
  answers: EMPTY,
  activate: (patientId) => set((state) => (
    state.patientId === patientId ? state : { patientId, answers: EMPTY }
  )),
  clear: (patientId) => set((state) => (
    state.patientId === patientId ? { answers: EMPTY } : state
  )),
  answer: (patientId, id, value) => set((state) => {
    if (!patientId || state.patientId !== patientId) return state
    const answers = { ...state.answers }
    if (value === undefined) delete answers[id]
    else answers[id] = value
    return { answers }
  }),
}))
export function useNhiLipidReview(patientId?: string): NhiLipidAnswers {
  const activate = useNhiLipidReviewStore((state) => state.activate)
  useEffect(() => { activate(patientId) }, [activate, patientId])
  return useNhiLipidReviewStore((state) => (
    state.patientId === patientId ? state.answers : EMPTY
  ))
}
