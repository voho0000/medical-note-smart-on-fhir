// features/right-panel/Feature.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import MedicalChatFeature from "@/features/medical-chat/Feature"
import { NoteProvider } from "@/src/application/providers/note.provider"
import { DataSelectionPanel } from "@/features/data-selection/components/DataSelectionPanel"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { DataSelectionProvider, useDataSelection } from "@/src/application/providers/data-selection.provider"
import type { DataSelection } from "@/src/core/entities/clinical-context.entity"
import { GptResponseProvider } from "@/src/application/providers/gpt-response.provider"
import { AsrProvider } from "@/src/application/providers/asr.provider"
import ClinicalInsightsFeature from "@/features/clinical-insights/Feature"
import SettingsFeature from "@/features/settings/Feature"
import { ClinicalInsightsConfigProvider } from "@/src/application/providers/clinical-insights-config.provider"
import { PromptTemplatesProvider } from "@/src/application/providers/prompt-templates.provider"
import { useLanguage } from "@/src/application/providers/language.provider"

// ClinicalData type is now from the new provider

export function RightPanelFeature() {
  return (
    <DataSelectionProvider>
      <RightPanelContent />
    </DataSelectionProvider>
  )
}

function RightPanelContent() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState("medicalChat")
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
          <PromptTemplatesProvider>
            <ClinicalInsightsConfigProvider>
            <Tabs 
              value={activeTab} 
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
              defaultValue="medicalChat"
            >
              <TabsList className="w-full justify-start gap-1 h-12 bg-muted/50 p-1 border">
                <TabsTrigger value="medicalChat" className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                  {t.tabs.noteChat}
                </TabsTrigger>
                <TabsTrigger value="dataSelection" className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                  {t.tabs.dataSelection}
                </TabsTrigger>
                <TabsTrigger value="clinicalInsights" className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                  {t.tabs.clinicalInsights}
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                  {t.tabs.settings}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="medicalChat" className="flex-1 overflow-hidden mt-4" forceMount>
                <div className="h-full">
                  <MedicalChatFeature />
                </div>
              </TabsContent>
              
              <TabsContent value="dataSelection" className="flex-1 mt-4">
                <ScrollArea className="h-full pr-2">
                  <div className="rounded-lg border p-4">
                    <DataSelectionPanel 
                      clinicalData={{
                        conditions: clinicalData.conditions || [],
                        medications: clinicalData.medications || [],
                        allergies: clinicalData.allergies || [],
                        diagnosticReports: clinicalData.diagnosticReports || [],
                        procedures: clinicalData.procedures || [],
                        observations: clinicalData.observations || [],
                        vitalSigns: clinicalData.vitalSigns || [],
                        encounters: clinicalData.encounters || []
                      }}
                      selectedData={selectedData}
                      onSelectionChange={setSelectedData}
                      filters={filters}
                      onFiltersChange={setFilters}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="clinicalInsights" className="flex-1 mt-4">
                <div className="h-full py-2">
                  <ClinicalInsightsFeature />
                </div>
              </TabsContent>

              <TabsContent value="settings" className="flex-1 mt-4">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-4 py-2">
                    <SettingsFeature />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            </ClinicalInsightsConfigProvider>
          </PromptTemplatesProvider>
        </NoteProvider>
      </AsrProvider>
    </GptResponseProvider>
  )
}
