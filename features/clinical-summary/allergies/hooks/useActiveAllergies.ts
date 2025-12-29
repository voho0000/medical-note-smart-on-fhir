// Custom Hook: Active Allergies Filter
import { useMemo } from 'react'
import type { AllergyIntolerance } from '../types'

export function useActiveAllergies(allergies: any[]) {
  return useMemo(() => {
    return (allergies as AllergyIntolerance[]).filter(a => 
      a.clinicalStatus?.coding?.[0]?.code === 'active' || 
      a.verificationStatus?.coding?.[0]?.code === 'confirmed'
    )
  }, [allergies])
}
