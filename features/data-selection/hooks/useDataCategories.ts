import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataSelection } from "@/src/core/entities/clinical-context.entity"

type ClinicalData = {
  conditions: any[]
  medications: any[]
  allergies: any[]
  diagnosticReports: any[]
  procedures: any[]
  observations: any[]
}

export type DataType = keyof DataSelection

export interface DataItem {
  id: DataType
  label: string
  description: string
  count: number
  category?: string
}

export function useDataCategories(
  clinicalData: ClinicalData,
  getFilteredCount: (items: any[], dataType: 'diagnosticReports' | 'observations') => number,
  filterKey: number
) {
  const { t } = useLanguage()
  
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
        count: clinicalData.conditions?.length || 0,
        category: 'clinical'
      },
      {
        id: 'medications' as const,
        label: t.dataSelection.medications,
        description: t.dataSelection.medicationsDesc,
        count: clinicalData.medications?.length || 0,
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
        count: getFilteredCount(clinicalData.diagnosticReports || [], 'diagnosticReports'),
        category: 'diagnostics'
      },
      {
        id: 'procedures' as const,
        label: t.dataSelection.procedures,
        description: t.dataSelection.proceduresDesc,
        count: clinicalData.procedures?.length || 0,
        category: 'procedures'
      },
      {
        id: 'observations' as const,
        label: t.dataSelection.observations,
        description: t.dataSelection.observationsDesc,
        count: getFilteredCount(clinicalData.observations || [], 'observations'),
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
    getFilteredCount
  ])
}
