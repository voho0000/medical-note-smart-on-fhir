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
/** In-memory visit answers only. Switching patients clears the previous visit;
 * no PHI or clinical assertions are written to browser storage. */
export const useNhiLipidReviewStore = create<ReviewState>((set) => ({
  answers: EMPTY,
  activate: patientId => set(state => state.patientId === patientId ? state : { patientId, answers: EMPTY }),
  clear: patientId => set(state => state.patientId === patientId ? { answers: EMPTY } : state),
  answer: (patientId, id, value) => set(state => {
    if (!patientId || state.patientId !== patientId) return state
    const answers = { ...state.answers }
    if (value === undefined) delete answers[id]
    else answers[id] = value
    return { answers }
  }),
}))
export function useNhiLipidReview(patientId?: string): NhiLipidAnswers {
  const activate = useNhiLipidReviewStore(state => state.activate)
  useEffect(() => { activate(patientId) }, [activate, patientId])
  return useNhiLipidReviewStore(state => state.patientId === patientId ? state.answers : EMPTY)
}
