// features/data-selection/Feature.tsx
"use client"

import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"
import { DataSelectionPanel } from "./components/DataSelectionPanel"
import { useDataSelection } from "./hooks/useDataSelection"

type ClinicalData = {
  diagnoses?: any[]
  medications?: any[]
  allergies?: any[]
  diagnosticReports?: any[]
  vitalSigns?: any[]
  vitals?: any[]
  observations?: any[]
  isLoading: boolean
}

export function DataSelectionFeature() {
  const clinicalData = useClinicalData() as ClinicalData
  const { selectedData, setSelectedData } = useDataSelection()

  if (clinicalData.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Loading clinical data...</div>
          <div className="text-sm text-muted-foreground">Please wait while we load your data</div>
        </div>
      </div>
    )
  }

  // Safely get data with fallback to empty arrays
  const data = {
    conditions: clinicalData.diagnoses || [],
    medications: clinicalData.medications || [],
    allergies: clinicalData.allergies || [],
    diagnosticReports: clinicalData.diagnosticReports || [],
    observations: clinicalData.observations || clinicalData.vitalSigns || clinicalData.vitals || []
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Data Selection</h1>
            <p className="text-sm text-muted-foreground">
              Select which clinical data to include in your medical notes
            </p>
          </div>
          
          <DataSelectionPanel 
            clinicalData={data}
            selectedData={selectedData}
            onSelectionChange={setSelectedData}
          />
        </div>
      </div>
    </div>
  )
}
