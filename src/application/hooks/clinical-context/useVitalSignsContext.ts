// Vital Signs Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import type { ClinicalData, Observation } from "./types"

export function useVitalSignsContext(
  includeObservations: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection[] {
  return useMemo(() => {
    if (!includeObservations) return []

    const allVitalSigns = [...(clinicalData?.vitalSigns ?? [])]

    if (allVitalSigns.length === 0) {
      return [{ title: "Vital Signs", items: ["No vital signs data available."] }]
    }

    // Deduplicate by id
    const uniqueVitalSigns = Array.from(new Map(allVitalSigns.map((v) => [v.id, v])).values())

    const filteredVitalSigns = uniqueVitalSigns.filter((obs: Observation) =>
      isWithinTimeRange(obs.effectiveDateTime, filters?.vitalSignsTimeRange ?? "1m")
    )

    if (filteredVitalSigns.length === 0) {
      return [{ title: "Vital Signs", items: ["No vital signs found within the selected time range."] }]
    }

    // Group by type and get latest
    const byType = new Map<string, Observation[]>()
    filteredVitalSigns.forEach((obs) => {
      const type = obs.code?.text || "Unknown"
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type)!.push(obs)
    })

    const sections: ClinicalContextSection[] = []
    byType.forEach((observations, type) => {
      const latest = [...observations].sort((a, b) => 
        (b.effectiveDateTime || "").localeCompare(a.effectiveDateTime || "")
      )[0]
      const value = latest.valueQuantity?.value ?? latest.valueString
      const unit = latest.valueQuantity?.unit ?? ""
      if (value !== undefined && value !== null) {
        sections.push({ title: type, items: [`${String(value)} ${unit}`.trim()] })
      }
    })

    return sections
  }, [includeObservations, clinicalData, filters])
}
