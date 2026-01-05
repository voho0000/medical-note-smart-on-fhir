// Left Panel Layout (Clinical Summary) - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getEnabledTabs, getFeaturesForTab, type TabConfig } from "@/src/shared/config/feature-registry"
import { useLanguage } from "@/src/application/providers/language.provider"

// ============================================================================
// TAB CONTENT RENDERER - Renders features for a specific tab
// ============================================================================
function TabFeatureContent({ tabId }: { tabId: string }) {
  const features = getFeaturesForTab(tabId)
  
  return (
    <ScrollArea className="h-full pr-2">
      <div className="space-y-4">
        {features.map(feature => {
          const Component = feature.component
          return <Component key={feature.id} />
        })}
      </div>
    </ScrollArea>
  )
}

// ============================================================================
// MAIN EXPORT - Clinical Summary Feature (Left Panel)
// ============================================================================
export default function ClinicalSummaryFeature() {
  const { t } = useLanguage()
  const tabs = getEnabledTabs()
  const defaultTab = tabs[0]?.id || 'patient'

  // Helper to get tab label (supports i18n)
  const getTabLabel = (tab: TabConfig): string => {
    const key = tab.labelKey as keyof typeof t.tabs
    return t.tabs[key] || tab.id
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <Tabs defaultValue={defaultTab} className="flex h-full flex-col">
        <TabsList className="w-full justify-start gap-1 h-12 bg-muted/50 p-1 border">
          {tabs.map(tab => (
            <TabsTrigger 
              key={tab.id}
              value={tab.id} 
              className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              {getTabLabel(tab)}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="flex-1 mt-4">
            <TabFeatureContent tabId={tab.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
