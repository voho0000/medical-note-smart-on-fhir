// Left Panel Layout (Clinical Summary) - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getEnabledTabs, getFeaturesForTab, type TabConfig } from "@/src/shared/config/feature-registry"
import { useLanguage } from "@/src/application/providers/language.provider"
import { LEFT_PANEL_TAB_THEMES, UI_COLORS } from "@/src/shared/config/ui-theme.config"

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

  // Helper to get tab theme
  const getTabTheme = (tabId: string) => {
    return LEFT_PANEL_TAB_THEMES[tabId] || LEFT_PANEL_TAB_THEMES['patient']
  }

  // Static class mappings for Tailwind (dynamic class names don't work with Tailwind's JIT)
  // Light mode: colored backgrounds, Dark mode: subtle borders with muted backgrounds
  const TAB_ACTIVE_CLASSES: Record<string, string> = {
    clinical: 'data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-500/10 dark:data-[state=active]:text-emerald-400 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-emerald-500/30',
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <Tabs defaultValue={defaultTab} className="flex h-full flex-col">
        <TabsList className="w-full grid grid-cols-4 gap-1 h-12 bg-muted/50 p-1 border">
          {tabs.map(tab => {
            const theme = getTabTheme(tab.id)
            const Icon = theme.icon
            const activeClasses = TAB_ACTIVE_CLASSES[theme.colorKey] || TAB_ACTIVE_CLASSES.clinical
            return (
              <TabsTrigger 
                key={tab.id}
                value={tab.id} 
                className={`text-sm font-semibold min-w-0 flex items-center gap-1.5 ${activeClasses}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate" title={getTabLabel(tab)}>{getTabLabel(tab)}</span>
              </TabsTrigger>
            )
          })}
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
