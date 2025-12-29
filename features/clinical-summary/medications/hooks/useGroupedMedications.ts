// Custom Hook: Group Medications
import { useMemo } from 'react'
import type { MedicationRow } from '../types'

export interface MedicationGroup {
  name: string
  activeMedications: MedicationRow[]
  inactiveMedications: MedicationRow[]
}

export function useGroupedMedications(medications: MedicationRow[]) {
  return useMemo(() => {
    const active: MedicationRow[] = []
    const inactiveByName = new Map<string, MedicationRow[]>()

    medications.forEach((med) => {
      if (med.isInactive) {
        const existing = inactiveByName.get(med.title) || []
        existing.push(med)
        inactiveByName.set(med.title, existing)
      } else {
        active.push(med)
      }
    })

    // Sort inactive medications by date (newest first) within each group
    inactiveByName.forEach((meds, name) => {
      meds.sort((a, b) => {
        const dateA = a.startedOn || ''
        const dateB = b.startedOn || ''
        return dateB.localeCompare(dateA)
      })
    })

    return {
      activeMedications: active,
      inactiveMedicationGroups: Array.from(inactiveByName.entries()).map(([name, meds]) => ({
        name,
        count: meds.length,
        medications: meds
      }))
    }
  }, [medications])
}
