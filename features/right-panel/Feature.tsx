// features/right-panel/Feature.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import MedicalNoteFeature from "@/features/medical-note/Feature"
import { NoteProvider } from "@/features/medical-note/providers/NoteProvider"
import { DataSelectionPanel } from "@/features/data-selection/components/DataSelectionPanel"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"
import { DataSelectionProvider, useDataSelection, type DataSelection } from "@/features/data-selection/hooks/useDataSelection"
import { GptResponseProvider } from "@/features/medical-note/context/GptResponseContext"
import { AsrProvider } from "@/features/medical-note/context/AsrContext"
import ClinicalInsightsFeature from "@/features/clinical-insights/Feature"
import SettingsFeature from "@/features/settings/Feature"
import { ClinicalInsightsConfigProvider } from "@/features/clinical-insights/context/ClinicalInsightsConfigContext"

// Import the ClinicalData type from the provider
import type { ClinicalData as ClinicalDataFromProvider } from "@/lib/providers/ClinicalDataProvider"

// Define the expected shape of the clinical data for this component
interface ClinicalData extends Omit<ClinicalDataFromProvider, 'vitals'> {
  // Add any additional properties specific to this component
}

export function RightPanelFeature() {
  return (
    <DataSelectionProvider>
      <RightPanelContent />
    </DataSelectionProvider>
  )
}

function RightPanelContent() {
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
    <GptResponseProvider>
      <AsrProvider>
        <NoteProvider>
          <ClinicalInsightsConfigProvider>
            <Tabs 
              value={activeTab} 
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
              defaultValue="medicalNote"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="medicalNote">Medical Note</TabsTrigger>
                <TabsTrigger value="dataSelection">Data Selection</TabsTrigger>
                <TabsTrigger value="clinicalInsights">Clinical Insights</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              
              <TabsContent value="medicalNote" className="flex-1 mt-0 pt-4" forceMount>
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-4">
                    <MedicalNoteFeature />
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="dataSelection" className="flex-1 mt-0 pt-4" forceMount>
                <ScrollArea className="h-full pr-2">
                  <div className="rounded-lg border p-4">
                    <DataSelectionPanel 
                      clinicalData={{
                        // Use diagnoses instead of conditions since that's what's available
                        conditions: clinicalData.diagnoses || [],
                        medications: clinicalData.medications || [],
                        allergies: clinicalData.allergies || [],
                        diagnosticReports: clinicalData.diagnosticReports || [],
                        observations: clinicalData.observations || []
                      }}
                      selectedData={selectedData}
                      onSelectionChange={setSelectedData}
                      filters={filters}
                      onFiltersChange={setFilters}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="clinicalInsights" className="flex-1 mt-0 pt-4" forceMount>
                <ClinicalInsightsFeature />
              </TabsContent>

              <TabsContent value="settings" className="flex-1 mt-0 pt-4" forceMount>
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-4">
                    <SettingsFeature />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </ClinicalInsightsConfigProvider>
        </NoteProvider>
      </AsrProvider>
    </GptResponseProvider>
  )
}
