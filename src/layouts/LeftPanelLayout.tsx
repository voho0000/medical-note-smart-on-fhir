// Left Panel Layout (Clinical Summary) - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { useEffect, useRef, useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getEnabledTabs, getFeaturesForTab, type TabConfig } from "@/src/shared/config/feature-registry"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightDetail } from "@/src/application/providers/right-detail.provider"
import {
  useResourceNavigationStore,
  leftTabForResourceType,
} from "@/src/application/stores/resource-navigation.store"
import { LEFT_PANEL_TAB_THEMES } from "@/src/shared/config/ui-theme.config"
import { FhirDataIssuesBanner } from "@/features/clinical-summary/components/FhirDataIssuesBanner"
import { SdkSourceLimitationsBanner } from "@/features/clinical-summary/components/SdkSourceLimitationsBanner"
import { useLeftBrowserTourStore } from "@/features/left-browser-tour"
import {
  ClinicalTabContentFrame,
  ClinicalTabList,
  ClinicalTabTrigger,
} from "@/src/shared/components/clinical-workspace"

// ============================================================================
// TAB CONTENT RENDERER - Renders features for a specific tab
// ============================================================================
function TabFeatureContent({ tabId }: { tabId: string }) {
  const features = getFeaturesForTab(tabId)
  
  return (
    <ScrollArea className="h-full">
      {/*
        CSS containment (`contain: inline-size`) decouples this wrapper's
        intrinsic width from its children's content size. Without this,
        Radix ScrollArea's internal `display:table; min-width:100%` wrapper
        grows with the widest child (wide tables in CumulativeLabReport),
        pushing absolute-positioned UI like the expand button off-screen.
      */}
      <ClinicalTabContentFrame
        className="space-y-3 pb-3 pt-2"
        style={{ contain: 'inline-size' }}
      >
        {features.map(feature => {
          const Component = feature.component
          return <Component key={feature.id} />
        })}
      </ClinicalTabContentFrame>
    </ScrollArea>
  )
}

// ============================================================================
// MAIN EXPORT - Clinical Summary Feature (Left Panel)
// ============================================================================
export default function ClinicalSummaryFeature() {
  const { t } = useLanguage()
  const { clearDetail } = useRightDetail()
  const tabs = getEnabledTabs()
  const defaultTab = tabs[0]?.id || 'patient'

  // Controlled (was uncontrolled defaultValue) so resource navigation — a
  // cited source clicked in the Medical Summary tab — can switch to the tab
  // owning that resource type before its anchor scroll-flashes the card.
  const [activeTab, setActiveTab] = useState(defaultTab)
  const tourActive = useLeftBrowserTourStore((state) => state.active)
  const tourStep = useLeftBrowserTourStore((state) => state.stepId)
  const preTourTabRef = useRef<string | null>(null)
  const wasTourActiveRef = useRef(false)
  const pending = useResourceNavigationStore((s) => s.pending)
  const seq = useResourceNavigationStore((s) => s.seq)
  useEffect(() => {
    if (!pending) return
    const target = leftTabForResourceType(pending.resourceType)
    if (target && tabs.some((tab) => tab.id === target)) {
      setActiveTab(target)
      clearDetail() // same contract as a manual tab switch
    }
    // seq re-fires this even when navigating to the same target twice.
  }, [pending, seq, tabs, clearDetail])

  // A tour step should demonstrate the actual feature rather than merely
  // pointing at a hidden tab. Preserve the user's starting tab and restore it
  // when the tour is finished or skipped.
  useEffect(() => {
    if (tourActive && !wasTourActiveRef.current) {
      preTourTabRef.current = activeTab
      wasTourActiveRef.current = true
    }

    if (!tourActive && wasTourActiveRef.current) {
      wasTourActiveRef.current = false
      setActiveTab(preTourTabRef.current ?? defaultTab)
      preTourTabRef.current = null
      clearDetail()
      return
    }

    if (!tourActive || !tourStep) return

    const targetTab = (() => {
      if (tourStep === 'visits') return 'visits'
      if (['reports', 'trend', 'imaging-ai'].includes(tourStep)) return 'reports'
      if (['medications', 'medication-timeline', 'right-pane'].includes(tourStep)) return 'meds'
      if (tourStep === 'documents') return 'documents'
      return null
    })()

    if (targetTab && tabs.some((tab) => tab.id === targetTab)) {
      setActiveTab(targetTab)
    }
    if (tourStep !== 'right-pane') clearDetail()
  }, [activeTab, clearDetail, defaultTab, tabs, tourActive, tourStep])

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
    <div className="flex h-full flex-col" data-tour="left-panel">
      <SdkSourceLimitationsBanner />
      <FhirDataIssuesBanner />
      <Tabs
        value={activeTab}
        // Switching the left clinical tab dismisses any right-pane detail
        // (向右展開) opened from the previous tab — the detail is tied to that
        // tab's content, so navigating away retracts it back to the AI panel.
        onValueChange={(value) => {
          setActiveTab(value)
          clearDetail()
        }}
        className="flex min-h-0 flex-1 flex-col xl:gap-0"
      >
        {/* Grid columns are driven by the registered tab count so adding /
            removing tabs in feature-registry.ts doesn't need a layout edit.
            Tailwind JIT can't generate dynamic `grid-cols-N` from a runtime
            length, so the column template goes via inline style. The label
            already uses `truncate` + a `title` tooltip, so narrower per-tab
            widths still render the full label on hover. */}
        <ClinicalTabList
          data-tour="left-tabs"
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map(tab => {
            const theme = getTabTheme(tab.id)
            const Icon = theme.icon
            return (
              <ClinicalTabTrigger
                key={tab.id}
                value={tab.id}
                data-tour={`left-tab-${tab.id}`}
                icon={Icon}
                iconVisibility="desktop"
                label={getTabLabel(tab)}
                className="px-1"
              />
            )
          })}
        </ClinicalTabList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-1 flex-1 xl:mt-0">
            <TabFeatureContent tabId={tab.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
