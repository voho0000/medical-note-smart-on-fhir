import { useMemo } from "react"
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
  return useMemo(() => {
    const _ = filterKey
    return [
      {
        id: 'patientInfo' as const,
        label: 'Patient Information',
        description: 'Demographics such as age and gender',
        count: 1,
        category: 'patient'
      },
      {
        id: 'conditions' as const,
        label: 'Medical Conditions',
        description: 'Active and historical medical conditions',
        count: clinicalData.conditions?.length || 0,
        category: 'clinical'
      },
      {
        id: 'medications' as const,
        label: 'Medications',
        description: 'Current and past medications',
        count: clinicalData.medications?.length || 0,
        category: 'medication'
      },
      {
        id: 'allergies' as const,
        label: 'Allergies & Intolerances',
        description: 'Known allergies and adverse reactions',
        count: clinicalData.allergies?.length || 0,
        category: 'clinical'
      },
      {
        id: 'diagnosticReports' as const,
        label: 'Diagnostic Reports',
        description: 'Lab results and diagnostic imaging reports',
        count: getFilteredCount(clinicalData.diagnosticReports || [], 'diagnosticReports'),
        category: 'diagnostics'
      },
      {
        id: 'procedures' as const,
        label: 'Procedures',
        description: 'Surgical and clinical procedures',
        count: clinicalData.procedures?.length || 0,
        category: 'procedures'
      },
      {
        id: 'observations' as const,
        label: 'Vital Signs',
        description: 'Vital signs and other clinical measurements',
        count: getFilteredCount(clinicalData.observations || [], 'observations'),
        category: 'clinical'
      }
    ]
  }, [
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
