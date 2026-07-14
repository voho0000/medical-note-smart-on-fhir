// Right Panel Layout - Pluggable Architecture
// Contributors can easily add/remove/replace features by modifying the registry
"use client"

import { ComponentType, ReactNode } from "react"
import dynamic from "next/dynamic"
import { MoreHorizontal, SlidersHorizontal } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getEnabledRightPanelFeatures, type RightPanelFeatureConfig } from "@/src/shared/config/right-panel-registry"
import { groupRightPanelFeatures, isFeaturePinned, useRightPanelTabsStore } from "@/src/application/stores/right-panel-tabs.store"
import { RIGHT_PANEL_TAB_THEMES, TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
// RightPanelProvider moved to AppProviders (app-level) in v0.4.0 so the
// header's overflow menu can navigate to right-panel tabs (e.g. open
// Settings → 顯示). Only useRightPanel is imported here now.
import { useRightPanel } from '@/src/application/providers/right-panel.provider'

// ============================================================================
// FEATURE COMPONENTS - lazy-loaded so each feature is its own chunk instead of
// all seven landing in the initial bundle. forceMounted tabs still fetch their
// chunk on panel mount (in parallel); the rest only when first opened.
// ============================================================================
const FeatureLoading = () => (
  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground animate-pulse">
    …
  </div>
)
// next/dynamic options are statically analyzed — they MUST be inline object
// literals (a shared `const opts` breaks the build), hence the repetition.
const MedicalSummaryFeature = dynamic(() => import("@/features/medical-summary/Feature"), {
  ssr: false,
  loading: FeatureLoading,
})
const MedicalChatFeature = dynamic(() => import("@/features/medical-chat/Feature"), {
  ssr: false,
  loading: FeatureLoading,
})
const IpsExportFeature = dynamic(() => import("@/features/ips-export/Feature"), {
  ssr: false,
  loading: FeatureLoading,
})
const MedicalCalculatorFeature = dynamic(() => import("@/features/medical-calculator/Feature"), {
  ssr: false,
  loading: FeatureLoading,
})
const SettingsFeature = dynamic(() => import("@/features/settings/Feature"), {
  ssr: false,
  loading: FeatureLoading,
})

// ============================================================================
// PROVIDERS - Import providers needed by features
// ============================================================================
import { DataSelectionProvider } from "@/src/application/providers/data-selection.provider"
import { AdaptiveDataDefaultsRunner } from "@/features/data-selection/AdaptiveDataDefaultsRunner"
import { AsrProvider } from "@/src/application/providers/asr.provider"
import { ClinicalInsightsConfigProvider } from "@/src/application/providers/clinical-insights-config.provider"
import { ChatTemplatesProvider } from "@/src/application/providers/chat-templates.provider"
import { ClinicalInsightsRuntimeProvider } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"

// ============================================================================
// FEATURE COMPONENT MAP - Map feature IDs to their components
// Contributors: Add your feature component here
// ============================================================================
const FEATURE_COMPONENTS: Record<string, ComponentType> = {
  'medical-summary': MedicalSummaryFeature,
  'medical-chat': MedicalChatFeature,
  'ips-export': IpsExportFeature,
  'medical-calculator': MedicalCalculatorFeature,
  'settings': SettingsFeature,
}

// ============================================================================
// PROVIDERS WRAPPER - Wrap all providers needed by right panel features
// Contributors: Add your providers here if needed
// ============================================================================
function RightPanelProviders({ children }: { children: ReactNode }) {
  return (
    <DataSelectionProvider>
      <AdaptiveDataDefaultsRunner />
      <AsrProvider>
        <ChatTemplatesProvider>
          <ClinicalInsightsConfigProvider>
            <ClinicalInsightsRuntimeProvider>
              {children}
            </ClinicalInsightsRuntimeProvider>
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
  // RightPanelProvider lives in AppProviders now; here we only mount the
  // right-panel-specific providers (data selection, ASR, etc.). The
  // provider's defaultTab is fixed at 'medical-chat' app-wide, matching
  // what features[0]?.id resolved to previously.
  return (
    <RightPanelProviders>
      <RightPanelContentInner />
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

  // Medical summary intentionally scrolls with the entire right panel. This
  // lets the top-level feature tabs leave the viewport while its card chips
  // remain sticky against the panel's own scrollport.
  if (feature.scrollMode === 'panel') {
    return (
      <div className="py-2 pr-2">
        <Component />
      </div>
    )
  }

  // Wrap with ScrollArea for non-chat features.
  //
  // Radix renders the viewport's content in a `display:table; min-width:100%`
  // wrapper (shrink-to-fit), which GROWS to a child's max-content width. A
  // child with a wide intrinsic width can therefore stretch the whole panel
  // past the column and overflow the viewport horizontally. These panels only
  // ever scroll vertically, so force that wrapper to `display:block`
  // (= viewport width, content wraps).
  if (feature.id !== 'medical-chat') {
    return (
      <ScrollArea className="h-full pr-2 [&_[data-radix-scroll-area-viewport]>div]:!block">
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
  const pinOverrides = useRightPanelTabsStore((s) => s.pinOverrides)
  const setPinned = useRightPanelTabsStore((s) => s.setPinned)

  // Pluggability guard: the provider's default (or a stale selection) may
  // point at a feature that has been unplugged in the registry — fall back
  // to the first enabled feature instead of rendering an empty panel.
  const effectiveTab = features.some(f => f.id === activeTab)
    ? activeTab
    : features[0]?.id ?? activeTab

  // Tab-bar grouping is purely registry-driven (no feature ids here):
  // [pinned…] [temp trigger for an active overflow tab?] [more ▾] [pinLocked…]
  const {
    lockedFeatures,
    unlockedFeatures,
    pinnedFeatures,
    overflowFeatures,
  } = groupRightPanelFeatures(features, pinOverrides)
  // An overflow feature can become active (menu click, or external
  // setActiveTab e.g. from the header) — give it a temporary real trigger so
  // the Radix active state has a visible anchor.
  const activeOverflowFeature = overflowFeatures.find(f => f.id === effectiveTab)

  // Helper to get tab label (supports i18n)
  const getTabLabel = (feature: RightPanelFeatureConfig): string => {
    const key = feature.tabLabel as keyof typeof t.tabs
    return t.tabs[key] || feature.name
  }

  // Helper to get tab theme
  const getTabTheme = (featureId: string) => {
    return RIGHT_PANEL_TAB_THEMES[featureId] || RIGHT_PANEL_TAB_THEMES['settings']
  }

  const renderTrigger = (feature: RightPanelFeatureConfig) => {
    const theme = getTabTheme(feature.id)
    const Icon = theme.icon
    const activeClasses = TAB_ACTIVE_CLASSES[theme.colorKey] || TAB_ACTIVE_CLASSES.settings
    const label = getTabLabel(feature)
    return (
      <TabsTrigger
        key={feature.id}
        value={feature.id}
        className={`text-sm font-semibold min-w-0 flex items-center gap-1.5 ${activeClasses}`}
        title={label}
        aria-label={label}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {/* Below sm the multi-way grid leaves ~50px per tab — a 2-3 char
            truncated label is noise, so go icon-only (title + aria-label
            keep the name reachable). iconOnly features skip the label at
            every width. */}
        {!feature.iconOnly && (
          <span className="truncate hidden sm:inline">{label}</span>
        )}
      </TabsTrigger>
    )
  }

  const renderMenuItemContent = (feature: RightPanelFeatureConfig) => {
    const Icon = getTabTheme(feature.id).icon
    return (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        {getTabLabel(feature)}
      </>
    )
  }

  const showOverflowMenu = overflowFeatures.length > 0
  const columnCount =
    pinnedFeatures.length + (activeOverflowFeature ? 1 : 0) + (showOverflowMenu ? 1 : 0) + lockedFeatures.length

  return (
    <Tabs
      value={effectiveTab}
      onValueChange={setActiveTab}
      className="h-full flex flex-col"
    >
      <TabsList
        className="w-full grid gap-1 h-12 shrink-0 bg-muted/50 p-1 border"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {pinnedFeatures.map(renderTrigger)}
        {activeOverflowFeature && renderTrigger(activeOverflowFeature)}
        {/* Keep the pluggable overflow/pin mechanism, but do not spend a whole
            toolbar column on an empty menu. A future `pinned:false` feature or
            an existing user override makes this entry reappear automatically. */}
        {showOverflowMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="text-sm font-medium min-w-0 flex items-center justify-center gap-1.5 rounded-lg text-foreground/70 dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground/90 transition-colors data-[state=open]:bg-background data-[state=open]:text-foreground dark:data-[state=open]:bg-card"
              title={t.tabs.more}
              aria-label={t.tabs.more}
            >
              <MoreHorizontal className="h-4 w-4 shrink-0" />
              <span className="truncate hidden sm:inline">{t.tabs.more}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowFeatures.map(feature => (
                <DropdownMenuItem
                  key={feature.id}
                  onSelect={() => setActiveTab(feature.id)}
                >
                  {renderMenuItemContent(feature)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  {t.tabs.managePinned}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {unlockedFeatures.map(feature => (
                    <DropdownMenuCheckboxItem
                      key={feature.id}
                      checked={isFeaturePinned(feature, pinOverrides)}
                      onCheckedChange={(checked) => setPinned(feature.id, checked === true)}
                      // Keep the menu open while toggling several pins in a row
                      onSelect={(e) => e.preventDefault()}
                    >
                      {renderMenuItemContent(feature)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {lockedFeatures.map(renderTrigger)}
      </TabsList>

      {features.map(feature => (
        <TabsContent
          key={feature.id}
          value={feature.id}
          className={feature.contentClassName || 'flex-1 mt-1'}
          forceMount={feature.forceMount ? true : undefined}
        >
          <FeatureTabContent feature={feature} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
