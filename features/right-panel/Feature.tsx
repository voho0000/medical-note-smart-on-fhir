// features/right-panel/Feature.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import MedicalNoteFeature from "@/features/medical-note/Feature"
import { DataSelectionPanel } from "@/features/data-selection/components/DataSelectionPanel"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"
import { useDataSelection, DataSelection } from "@/features/data-selection/hooks/useDataSelection"

// Define the expected shape of the clinical data
type ClinicalData = {
  diagnoses: any[]
  medications: any[]
  allergies: any[]
  diagnosticReports: any[]
  vitalSigns: any[]
  conditions: any[]
  observations: any[]
}

export function RightPanelFeature() {
  const [activeTab, setActiveTab] = useState("medicalNote")
  const clinicalData = useClinicalData()
  const { 
    selectedData, 
    setSelectedData, 
    filters, 
    setFilters 
  } = useDataSelection()
  
  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters)
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={setActiveTab}
      className="h-full flex flex-col"
      defaultValue="medicalNote"
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="medicalNote">Medical Note</TabsTrigger>
        <TabsTrigger value="dataSelection">Data Selection</TabsTrigger>
      </TabsList>
      
      <TabsContent value="medicalNote" className="flex-1 mt-0 pt-4">
        <ScrollArea className="h-full pr-2">
          <div className="space-y-4">
            <MedicalNoteFeature />
          </div>
        </ScrollArea>
      </TabsContent>
      
      <TabsContent value="dataSelection" className="flex-1 mt-0 pt-4">
        <ScrollArea className="h-full pr-2">
          <div className="rounded-lg border p-4">
            <DataSelectionPanel 
              clinicalData={{
                conditions: clinicalData.diagnoses || [],
                medications: clinicalData.medications || [],
                allergies: clinicalData.allergies || [],
                diagnosticReports: clinicalData.diagnosticReports || [],
                observations: clinicalData.observations || clinicalData.vitalSigns || clinicalData.vitals || [],
              }}
              selectedData={selectedData}
              onSelectionChange={setSelectedData}
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
