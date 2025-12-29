// Conditions Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"

export function useConditionsContext(
  includeConditions: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeConditions || !clinicalData?.conditions?.length) return null

    const items = mapAndFilter(
      clinicalData.conditions,
      (d) => d.code?.text || "Unknown diagnosis"
    )

    if (items.length === 0) return null

    return { title: "Patient's Conditions", items }
  }, [includeConditions, clinicalData])
}
