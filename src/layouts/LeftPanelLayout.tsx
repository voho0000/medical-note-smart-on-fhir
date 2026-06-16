// Left Panel Layout (Clinical Summary) - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getEnabledTabs, getFeaturesForTab, type TabConfig } from "@/src/shared/config/feature-registry"
import { useLanguage } from "@/src/application/providers/language.provider"
import { LEFT_PANEL_TAB_THEMES, TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"

// ============================================================================
// TAB CONTENT RENDERER - Renders features for a specific tab
// ============================================================================
function TabFeatureContent({ tabId }: { tabId: string }) {
  const features = getFeaturesForTab(tabId)
  
  return (
    <ScrollArea className="h-full pr-2">
      {/*
        CSS containment (`contain: inline-size`) decouples this wrapper's
        intrinsic width from its children's content size. Without this,
        Radix ScrollArea's internal `display:table; min-width:100%` wrapper
        grows with the widest child (wide tables in CumulativeLabReport),
        pushing absolute-positioned UI like the expand button off-screen.
      */}
      <div className="space-y-3 w-full" style={{ contain: 'inline-size' }}>
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

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <Tabs defaultValue={defaultTab} className="flex h-full flex-col">
        {/* Grid columns are driven by the registered tab count so adding /
            removing tabs in feature-registry.ts doesn't need a layout edit.
            Tailwind JIT can't generate dynamic `grid-cols-N` from a runtime
            length, so the column template goes via inline style. The label
            already uses `truncate` + a `title` tooltip, so narrower per-tab
            widths still render the full label on hover. */}
        <TabsList
          // shrink-0: without it the flex column squeezes this h-12 bar by a
          // few px when a tab's content is tall (e.g. 報告), so the tab bar
          // jumped height between tabs. Pin it so the height is stable.
          className="w-full grid gap-1 h-12 shrink-0 bg-muted/50 p-1 border"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map(tab => {
            const theme = getTabTheme(tab.id)
            const Icon = theme.icon
            const activeClasses = TAB_ACTIVE_CLASSES[theme.colorKey] || TAB_ACTIVE_CLASSES.clinical
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                // px-1 keeps the icon+label centred at narrow widths (was
                // overflowing the trigger with the default px-3 once we
                // packed 5 tabs into the same width as 4).
                className={`text-sm font-semibold min-w-0 px-1 flex items-center gap-1.5 ${activeClasses}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate" title={getTabLabel(tab)}>{getTabLabel(tab)}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="flex-1 mt-1">
            <TabFeatureContent tabId={tab.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
