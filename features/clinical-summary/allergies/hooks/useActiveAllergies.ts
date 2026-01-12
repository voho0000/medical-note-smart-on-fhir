// Custom Hook: Active Allergies Filter
import { useMemo } from 'react'
import type { AllergyIntolerance } from '@/src/shared/types/fhir.types'

export function useActiveAllergies(allergies: any[]) {
  return useMemo(() => {
    // 显示所有过敏记录，除非明确标记为 inactive 或 resolved
    return (allergies as AllergyIntolerance[]).filter(a => {
      const clinicalStatus = a.clinicalStatus?.coding?.[0]?.code
      // 只排除明确标记为 inactive 或 resolved 的记录
      return clinicalStatus !== 'inactive' && clinicalStatus !== 'resolved'
    })
  }, [allergies])
}
