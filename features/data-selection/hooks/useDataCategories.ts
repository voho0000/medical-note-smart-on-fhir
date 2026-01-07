import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataSelection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import { useReportsRowCount } from "@/src/application/hooks/use-reports-row-count.hook"

export type DataType = keyof DataSelection

export interface DataItem {
  id: DataType
  label: string
  description: string
  count: number
  category?: string
}

export function useDataCategories(
  clinicalData: ClinicalDataCollection,
  getFilteredCount: (items: any[], dataType: 'diagnosticReports' | 'observations') => number,
  filterKey: number,
  filters?: { conditionStatus?: 'active' | 'all', medicationStatus?: 'active' | 'all', labReportVersion?: 'all' | 'latest', reportTimeRange?: string, vitalSignsVersion?: 'all' | 'latest', vitalSignsTimeRange?: string }
) {
  const { t } = useLanguage()
  const rowCounts = useReportsRowCount(
    clinicalData.diagnosticReports || [],
    clinicalData.observations || [],
    clinicalData.procedures || [],
    filters
  )
  
  // Calculate vital signs count
  const vitalSignsCount = useMemo(() => {
    const vitalSigns = clinicalData.vitalSigns || []
    if (vitalSigns.length === 0) return 0
    
    // Apply version filter
    let filtered = vitalSigns
    if (filters?.vitalSignsVersion === 'latest') {
      const latestByCode = new Map()
      filtered.forEach((obs: any) => {
        const code = obs.code?.text || obs.code?.coding?.[0]?.display || "Unknown"
        const existing = latestByCode.get(code)
        if (!existing || (obs.effectiveDateTime || "") > (existing.effectiveDateTime || "")) {
          latestByCode.set(code, obs)
        }
      })
      filtered = Array.from(latestByCode.values())
    }
    
    // Apply time range filter
    if (filters?.vitalSignsTimeRange && filters.vitalSignsTimeRange !== 'all') {
      const { isWithinTimeRange } = require("@/src/shared/utils/date.utils")
      filtered = filtered.filter((obs: any) => 
        isWithinTimeRange(obs.effectiveDateTime, filters.vitalSignsTimeRange)
      )
    }
    
    return filtered.length
  }, [clinicalData.vitalSigns, filters])
  
  return useMemo(() => {
    const _ = filterKey
    return [
      {
        id: 'patientInfo' as const,
        label: t.dataSelection.patientInfo,
        description: t.dataSelection.patientInfoDesc,
        count: 1,
        category: 'patient'
      },
      {
        id: 'conditions' as const,
        label: t.dataSelection.conditions,
        description: t.dataSelection.conditionsDesc,
        count: (() => {
          const conditions = clinicalData.conditions || []
          if (filters?.conditionStatus === 'active') {
            return conditions.filter((condition: any) => {
              const clinicalStatus = condition.clinicalStatus?.coding?.[0]?.code || 
                                    condition.clinicalStatus?.text ||
                                    condition.clinicalStatus
              
              // If no status field, treat as active
              if (!clinicalStatus) return true
              
              // Check if status is active (handle both string and object formats)
              const statusStr = typeof clinicalStatus === 'string' 
                ? clinicalStatus.toLowerCase() 
                : String(clinicalStatus).toLowerCase()
              
              return statusStr === 'active' || 
                     statusStr === 'recurrence' || 
                     statusStr === 'relapse'
            }).length
          }
          return conditions.length
        })(),
        category: 'clinical'
      },
      {
        id: 'medications' as const,
        label: t.dataSelection.medications,
        description: t.dataSelection.medicationsDesc,
        count: (() => {
          const medications = clinicalData.medications || []
          if (filters?.medicationStatus === 'active') {
            return medications.filter((med: any) => 
              med.status === 'active' || med.status === 'completed'
            ).length
          }
          return medications.length
        })(),
        category: 'medication'
      },
      {
        id: 'allergies' as const,
        label: t.dataSelection.allergies,
        description: t.dataSelection.allergiesDesc,
        count: clinicalData.allergies?.length || 0,
        category: 'clinical'
      },
      {
        id: 'diagnosticReports' as const,
        label: t.dataSelection.diagnosticReports,
        description: t.dataSelection.diagnosticReportsDesc,
        count: rowCounts.lab + rowCounts.imaging,
        category: 'diagnostics'
      },
      {
        id: 'procedures' as const,
        label: t.dataSelection.procedures,
        description: t.dataSelection.proceduresDesc,
        count: rowCounts.procedures,
        category: 'procedures'
      },
      {
        id: 'observations' as const,
        label: t.dataSelection.observations,
        description: t.dataSelection.observationsDesc,
        count: vitalSignsCount,
        category: 'clinical'
      }
    ]
  }, [
    t,
    clinicalData.conditions,
    clinicalData.medications,
    clinicalData.allergies,
    clinicalData.diagnosticReports,
    clinicalData.observations,
    clinicalData.procedures,
    filterKey,
    getFilteredCount,
    rowCounts,
    filters,
    vitalSignsCount
  ])
}
