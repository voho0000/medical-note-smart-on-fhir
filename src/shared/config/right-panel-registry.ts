// Right Panel Feature Registry - Central configuration for right panel features
// This allows contributors to easily add/remove/replace features in the right panel
import { ComponentType } from 'react'

export interface RightPanelFeatureConfig {
  id: string
  name: string
  /** The tab label (supports i18n key or direct string) */
  tabLabel: string
  /** The component to render in this tab */
  component: ComponentType
  /** Display order (lower = first) */
  order: number
  /** Whether this feature is enabled */
  enabled: boolean
  /** Optional: providers this feature needs (will be wrapped automatically) */
  providers?: ComponentType<{ children: React.ReactNode }>[]
  /** Optional: force mount the tab content (useful for chat to preserve state) */
  forceMount?: boolean
  /** Optional: custom wrapper className for the tab content */
  contentClassName?: string
}

/**
 * Right Panel Features Registry
 * 
 * To add a new feature:
 * 1. Create your feature component in features/your-feature/
 * 2. Add an entry here with your component
 * 3. Set enabled: true
 * 
 * To replace an existing feature:
 * 1. Set enabled: false on the feature you want to replace
 * 2. Add your new feature with the same or different id
 * 
 * To remove a feature:
 * 1. Set enabled: false
 */
export const RIGHT_PANEL_FEATURES: RightPanelFeatureConfig[] = [
  {
    id: 'medical-chat',
    name: 'Medical Chat',
    tabLabel: 'noteChat', // i18n key from translations
    component: () => null, // Will be lazy loaded
    order: 0,
    enabled: true,
    forceMount: true,
    contentClassName: 'flex-1 overflow-hidden mt-4',
  },
  {
    id: 'data-selection',
    name: 'Data Selection',
    tabLabel: 'dataSelection',
    component: () => null,
    order: 1,
    enabled: true,
    contentClassName: 'flex-1 mt-4',
  },
  {
    id: 'clinical-insights',
    name: 'Clinical Insights',
    tabLabel: 'clinicalInsights',
    component: () => null,
    order: 2,
    enabled: true,
    forceMount: true,
    contentClassName: 'flex-1 mt-4',
  },
  {
    id: 'settings',
    name: 'Settings',
    tabLabel: 'settings',
    component: () => null,
    order: 3,
    enabled: true,
    contentClassName: 'flex-1 mt-4',
  },
]

/**
 * Get enabled right panel features sorted by order
 */
export function getEnabledRightPanelFeatures(): RightPanelFeatureConfig[] {
  return RIGHT_PANEL_FEATURES
    .filter(feature => feature.enabled)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get right panel feature by ID
 */
export function getRightPanelFeatureById(id: string): RightPanelFeatureConfig | undefined {
  return RIGHT_PANEL_FEATURES.find(feature => feature.id === id)
}

/**
 * Register a new right panel feature dynamically
 * Useful for plugins or runtime feature additions
 */
export function registerRightPanelFeature(feature: RightPanelFeatureConfig): void {
  const existingIndex = RIGHT_PANEL_FEATURES.findIndex(f => f.id === feature.id)
  if (existingIndex >= 0) {
    RIGHT_PANEL_FEATURES[existingIndex] = feature
  } else {
    RIGHT_PANEL_FEATURES.push(feature)
  }
}

/**
 * Disable a right panel feature by ID
 */
export function disableRightPanelFeature(id: string): void {
  const feature = RIGHT_PANEL_FEATURES.find(f => f.id === id)
  if (feature) {
    feature.enabled = false
  }
}
