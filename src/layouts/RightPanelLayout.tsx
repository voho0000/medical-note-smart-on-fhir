// Right Panel Layout - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { useState, ComponentType, ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getEnabledRightPanelFeatures, type RightPanelFeatureConfig } from "@/src/shared/config/right-panel-registry"

// ============================================================================
// FEATURE COMPONENTS - Import your feature components here
// ============================================================================
import MedicalChatFeature from "@/features/medical-chat/Feature"
import { DataSelectionFeature } from "@/features/data-selection/Feature"
import ClinicalInsightsFeature from "@/features/clinical-insights/Feature"
import SettingsFeature from "@/features/settings/Feature"

// ============================================================================
// PROVIDERS - Import providers needed by features
// ============================================================================
import { NoteProvider } from "@/src/application/providers/note.provider"
import { DataSelectionProvider } from "@/src/application/providers/data-selection.provider"
import { GptResponseProvider } from "@/src/application/providers/gpt-response.provider"
import { AsrProvider } from "@/src/application/providers/asr.provider"
import { ClinicalInsightsConfigProvider } from "@/src/application/providers/clinical-insights-config.provider"
import { PromptTemplatesProvider } from "@/src/application/providers/prompt-templates.provider"

// ============================================================================
// FEATURE COMPONENT MAP - Map feature IDs to their components
// Contributors: Add your feature component here
// ============================================================================
const FEATURE_COMPONENTS: Record<string, ComponentType> = {
  'medical-chat': MedicalChatFeature,
  'data-selection': DataSelectionFeature,
  'clinical-insights': ClinicalInsightsFeature,
  'settings': SettingsFeature,
}

// ============================================================================
// PROVIDERS WRAPPER - Wrap all providers needed by right panel features
// Contributors: Add your providers here if needed
// ============================================================================
function RightPanelProviders({ children }: { children: ReactNode }) {
  return (
    <DataSelectionProvider>
      <GptResponseProvider>
        <AsrProvider>
          <NoteProvider>
            <PromptTemplatesProvider>
              <ClinicalInsightsConfigProvider>
                {children}
              </ClinicalInsightsConfigProvider>
            </PromptTemplatesProvider>
          </NoteProvider>
        </AsrProvider>
      </GptResponseProvider>
    </DataSelectionProvider>
  )
}

// ============================================================================
// MAIN EXPORT - Right Panel Feature
// ============================================================================
export function RightPanelFeature() {
  return (
    <RightPanelProviders>
      <RightPanelContent />
    </RightPanelProviders>
  )
}

// ============================================================================
// TAB CONTENT RENDERER - Renders individual feature content
// ============================================================================
function FeatureTabContent({ feature }: { feature: RightPanelFeatureConfig }) {
  const Component = FEATURE_COMPONENTS[feature.id]
  
  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Feature &quot;{feature.id}&quot; not found. Please register it in FEATURE_COMPONENTS.
      </div>
    )
  }

  // Wrap with ScrollArea for non-chat features
  if (feature.id !== 'medical-chat') {
    return (
      <ScrollArea className="h-full pr-2">
        <div className="py-2">
          <Component />
        </div>
      </ScrollArea>
    )
  }

  return (
    <div className="h-full">
      <Component />
    </div>
  )
}

// ============================================================================
// RIGHT PANEL CONTENT - Dynamic tab rendering from registry
// ============================================================================
function RightPanelContent() {
  const { t } = useLanguage()
  const features = getEnabledRightPanelFeatures()
  const defaultTab = features[0]?.id || 'medical-chat'
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Helper to get tab label (supports i18n)
  const getTabLabel = (feature: RightPanelFeatureConfig): string => {
    const key = feature.tabLabel as keyof typeof t.tabs
    return t.tabs[key] || feature.name
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={setActiveTab}
      className="h-full flex flex-col"
      defaultValue={defaultTab}
    >
      <TabsList className="w-full justify-start gap-1 h-12 bg-muted/50 p-1 border">
        {features.map(feature => (
          <TabsTrigger 
            key={feature.id}
            value={feature.id} 
            className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
          >
            {getTabLabel(feature)}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {features.map(feature => (
        <TabsContent 
          key={feature.id}
          value={feature.id} 
          className={feature.contentClassName || 'flex-1 mt-4'}
          forceMount={feature.forceMount ? true : undefined}
        >
          <FeatureTabContent feature={feature} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
