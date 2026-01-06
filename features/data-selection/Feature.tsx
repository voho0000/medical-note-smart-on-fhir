// features/data-selection/Feature.tsx
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { DataSelectionPanel } from "./components/DataSelectionPanel"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"

type ClinicalData = {
  diagnoses?: any[]
  medications?: any[]
  allergies?: any[]
  diagnosticReports?: any[]
  vitalSigns?: any[]
  vitals?: any[]
  observations?: any[]
  encounters?: any[]
  procedures?: any[]
  isLoading: boolean
}

export function DataSelectionFeature() {
  const { t } = useLanguage()
  const clinicalData = useClinicalData() as ClinicalData
  const { 
    selectedData, 
    setSelectedData, 
    filters, 
    setFilters 
  } = useDataSelection()

  if (clinicalData.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">{t.dataSelection.loadingData}</p>
        </div>
      </div>
    )
  }

  if (!clinicalData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">{t.dataSelection.noDataAvailable}</p>
        </div>
      </div>
    )
  }

  const data = {
    conditions: clinicalData.diagnoses || [],
    medications: clinicalData.medications || [],
    allergies: clinicalData.allergies || [],
    diagnosticReports: clinicalData.diagnosticReports || [],
    observations: clinicalData.observations || clinicalData.vitalSigns || clinicalData.vitals || [],
    vitalSigns: clinicalData.vitalSigns || clinicalData.vitals || [],
    procedures: clinicalData.procedures || [],
    encounters: clinicalData.encounters || []
  }

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters)
  }

  return (
    <div className="space-y-4">
      <DataSelectionPanel 
        clinicalData={data}
        selectedData={selectedData}
        onSelectionChange={setSelectedData}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}
