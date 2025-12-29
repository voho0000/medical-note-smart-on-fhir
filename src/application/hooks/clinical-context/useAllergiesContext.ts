// Allergies Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"

export function useAllergiesContext(
  includeAllergies: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeAllergies || !clinicalData?.allergies?.length) return null

    const items = mapAndFilter(
      clinicalData.allergies,
      (a) => a.code?.text || "Unknown allergy"
    )

    if (items.length === 0) return null

    return { title: "Patient's Allergies", items }
  }, [includeAllergies, clinicalData])
}
