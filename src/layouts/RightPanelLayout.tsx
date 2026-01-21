// Right Panel Layout - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { useState, ComponentType, ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getEnabledRightPanelFeatures, type RightPanelFeatureConfig } from "@/src/shared/config/right-panel-registry"
import { RIGHT_PANEL_TAB_THEMES, TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
import { RightPanelProvider, useRightPanel } from '@/src/application/providers/right-panel.provider'

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
import { DataSelectionProvider } from "@/src/application/providers/data-selection.provider"
import { AsrProvider } from "@/src/application/providers/asr.provider"
import { ClinicalInsightsConfigProvider } from "@/src/application/providers/clinical-insights-config.provider"
import { ChatTemplatesProvider } from "@/src/application/providers/chat-templates.provider"

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
      <AsrProvider>
        <ChatTemplatesProvider>
          <ClinicalInsightsConfigProvider>
            {children}
          </ClinicalInsightsConfigProvider>
        </ChatTemplatesProvider>
      </AsrProvider>
    </DataSelectionProvider>
  )
}

// ============================================================================
// MAIN EXPORT - Right Panel Feature
// ============================================================================
function RightPanelContent() {
  const features = getEnabledRightPanelFeatures()
  const defaultTab = features[0]?.id || 'medical-chat'
  
  return (
    <RightPanelProviders>
      <RightPanelProvider defaultTab={defaultTab}>
        <RightPanelContentInner />
      </RightPanelProvider>
    </RightPanelProviders>
  )
}

export function RightPanelFeature() {
  return (
    <div className="h-full flex flex-col">
      <RightPanelContent />
    </div>
  )
}

export default function RightPanelLayout() {
  return <RightPanelFeature />
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

function RightPanelContentInner() {
  const { t } = useLanguage()
  const features = getEnabledRightPanelFeatures()
  const { activeTab, setActiveTab } = useRightPanel()

  // Helper to get tab label (supports i18n)
  const getTabLabel = (feature: RightPanelFeatureConfig): string => {
    const key = feature.tabLabel as keyof typeof t.tabs
    return t.tabs[key] || feature.name
  }

  // Helper to get tab theme
  const getTabTheme = (featureId: string) => {
    return RIGHT_PANEL_TAB_THEMES[featureId] || RIGHT_PANEL_TAB_THEMES['settings']
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={setActiveTab}
      className="h-full flex flex-col"
    >
      <TabsList className="w-full grid grid-cols-4 gap-1 h-12 bg-muted/50 p-1 border">
        {features.map(feature => {
          const theme = getTabTheme(feature.id)
          const Icon = theme.icon
          const activeClasses = TAB_ACTIVE_CLASSES[theme.colorKey] || TAB_ACTIVE_CLASSES.settings
          return (
            <TabsTrigger 
              key={feature.id}
              value={feature.id} 
              className={`text-sm font-semibold min-w-0 flex items-center gap-1.5 ${activeClasses}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate" title={getTabLabel(feature)}>{getTabLabel(feature)}</span>
            </TabsTrigger>
          )
        })}
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
