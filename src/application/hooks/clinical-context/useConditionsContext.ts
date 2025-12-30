// Conditions Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"

export function useConditionsContext(
  includeConditions: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeConditions || !clinicalData?.conditions?.length) return null

    // Filter conditions by status if filter is set to 'active'
    let conditions = clinicalData.conditions
    if (filters?.conditionStatus === 'active') {
      conditions = conditions.filter((condition: any) => {
        const clinicalStatus = condition.clinicalStatus?.coding?.[0]?.code || 
                              condition.clinicalStatus?.text ||
                              condition.clinicalStatus
        // Include active, recurrence, relapse statuses
        return clinicalStatus === 'active' || 
               clinicalStatus === 'recurrence' || 
               clinicalStatus === 'relapse'
      })
    }

    const items = mapAndFilter(
      conditions,
      (d) => d.code?.text || "Unknown diagnosis"
    )

    if (items.length === 0) return null

    return { title: "Patient's Conditions", items }
  }, [includeConditions, clinicalData, filters])
}
