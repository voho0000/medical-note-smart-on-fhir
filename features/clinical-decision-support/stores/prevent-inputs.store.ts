import { useEffect } from 'react'
import { create } from 'zustand'
import type { CalcValues } from '@/features/medical-calculator/types'
const EMPTY: CalcValues = Object.freeze({})
interface State {
  patientId?: string
  inputs: CalcValues
  activate: (id?: string) => void
  clear: (id: string) => void
  setInput: (id: string, key: string, value?: string) => void
}
export const usePreventStore = create<State>(set => ({
  inputs: EMPTY,
  activate: patientId => set(s => s.patientId === patientId ? s : { patientId, inputs: EMPTY }),
  clear: id => set(s => s.patientId === id ? { inputs: EMPTY } : s),
  setInput: (id, key, value) => set(s => {
    if (!id || id !== s.patientId) return s
    const inputs = { ...s.inputs }
    if (value === undefined) delete inputs[key]
    else inputs[key] = value
    return { inputs }
  }),
}))
export function usePreventInputs(id?: string) {
  const activate = usePreventStore(s => s.activate)
  useEffect(() => { activate(id) }, [activate, id])
  return usePreventStore(s => s.patientId === id ? s.inputs : EMPTY)
}
