import { create } from 'zustand'
import type { CdssPatientProfile } from '../types'
export type AfAnswers = NonNullable<CdssPatientProfile['afClinicalAnswers']>
const EMPTY: AfAnswers = Object.freeze({})
interface State {
  patientId?: string
  answers: AfAnswers
  setPatient: (patientId: string | undefined) => void
  answer: (patientId: string, id: string, value: boolean | undefined) => void
}
/** Memory only. Changing the patient discards the previous patient's answers. */
export const useAfAnswersStore = create<State>((set) => ({
  answers: EMPTY,
  setPatient: (patientId) =>
    set((state) => (state.patientId === patientId ? state : { patientId, answers: EMPTY })),
  answer: (patientId, id, value) =>
    set((state) => {
      const answers = { ...(state.patientId === patientId ? state.answers : EMPTY) }
      if (value === undefined) delete answers[id]
      else answers[id] = value
      return { patientId, answers }
    }),
}))
export function useAfAnswers(patientId?: string): AfAnswers {
  return useAfAnswersStore((state) => (patientId && state.patientId === patientId ? state.answers : EMPTY))
}
