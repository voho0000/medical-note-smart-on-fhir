'use client'
import { createContext, useContext } from 'react'
import { useMedicationEndDateFit as useActualFit } from '@/features/clinical-summary/medications/hooks/useMedicationEndDateFit'
export const MeasureContext = createContext(true)
export function useMedicationEndDateFit(enabled: boolean, key: string) {
  return useActualFit(enabled && useContext(MeasureContext), key)
}
