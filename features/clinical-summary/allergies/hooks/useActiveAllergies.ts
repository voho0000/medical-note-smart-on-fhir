// Custom Hook: Active Allergies Filter
import { useMemo } from 'react'
import type { AllergyEntity } from '@/src/core/entities/clinical-data.entity'

export function useActiveAllergies(allergies: AllergyEntity[]) {
  return useMemo(() => {
    // Domain mapper stores clinicalStatus as a code string. Keep records whose
    // status is unknown, but never present explicitly inactive/resolved records
    // as current allergies.
    return allergies.filter(a => {
      const clinicalStatus = a.clinicalStatus?.toLowerCase()
      return clinicalStatus !== 'inactive' && clinicalStatus !== 'resolved'
    })
  }, [allergies])
}
