// Medications Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"

export function useMedicationsContext(
  includeMedications: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeMedications || !clinicalData?.medications?.length) return null

    const items = mapAndFilter(
      clinicalData.medications,
      (m) => m.medicationCodeableConcept?.text || "Unknown medication"
    )

    if (items.length === 0) return null

    return { title: "Patient's Medications", items }
  }, [includeMedications, clinicalData])
}
