// Vital Signs Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import { formatNumberSmart } from "@/features/clinical-summary/reports/utils/number-format.utils"
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
      return []
    }

    // Deduplicate by id
    const uniqueVitalSigns = Array.from(new Map(allVitalSigns.map((v) => [v.id, v])).values())

    const filteredVitalSigns = uniqueVitalSigns.filter((obs: Observation) =>
      isWithinTimeRange(obs.effectiveDateTime, filters?.vitalSignsTimeRange ?? "all")
    )

    if (filteredVitalSigns.length === 0) {
      return [{ title: "Vital Signs", items: ["No vital signs found within the selected time range."] }]
    }

    // Group by type and get latest
    const byType = new Map<string, Observation[]>()
    filteredVitalSigns.forEach((obs) => {
      // Try to get a meaningful name from code.text, coding display, or component codes
      let type = obs.code?.text || obs.code?.coding?.[0]?.display
      
      // If still no type and has components, try to infer from component names
      if (!type && Array.isArray(obs.component) && obs.component.length > 0) {
        const componentCodes = obs.component
          .map(c => c.code?.text || c.code?.coding?.[0]?.display)
          .filter(Boolean)
        if (componentCodes.some(c => c?.toLowerCase().includes('blood pressure'))) {
          type = 'Blood Pressure'
        }
      }
      
      type = type || "Vital Sign"
      
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type)!.push(obs)
    })

    const sections: ClinicalContextSection[] = []
    byType.forEach((observations, type) => {
      // Sort by date (newest first)
      const sorted = [...observations].sort((a, b) => 
        (b.effectiveDateTime || "").localeCompare(a.effectiveDateTime || "")
      )
      
      // Get observations based on version filter
      const observationsToShow = filters?.vitalSignsVersion === 'all' 
        ? sorted 
        : [sorted[0]] // latest only
      
      const items: string[] = []
      
      // Process each observation
      observationsToShow.forEach(obs => {
        // Format date
        const date = obs.effectiveDateTime 
          ? new Date(obs.effectiveDateTime).toLocaleString('zh-TW', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : ''
        
        // Handle component-based observations (e.g., Blood Pressure)
        if (Array.isArray(obs.component) && obs.component.length > 0) {
          const componentValues = obs.component
            .map((comp: any) => {
              const compValue = comp.valueQuantity?.value
              const compUnit = comp.valueQuantity?.unit || ''
              const compCode = comp.code?.text || comp.code?.coding?.[0]?.display || ''
              if (compValue !== undefined && compValue !== null) {
                const formattedValue = typeof compValue === 'number' ? formatNumberSmart(compValue) : compValue
                return `${compCode}: ${formattedValue} ${compUnit}`.trim()
              }
              return null
            })
            .filter(Boolean)
          
          if (componentValues.length > 0) {
            items.push(`${componentValues.join(', ')}${date ? ` (${date})` : ''}`)
          }
        } 
        // Handle simple value observations
        else {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ?? ""
          if (value !== undefined && value !== null) {
            const formattedValue = typeof value === 'number' ? formatNumberSmart(value) : value
            items.push(`${String(formattedValue)} ${unit}${date ? ` (${date})` : ''}`.trim())
          }
        }
      })
      
      if (items.length > 0) {
        sections.push({ title: type, items })
      }
    })

    return sections
  }, [includeObservations, clinicalData, filters])
}
