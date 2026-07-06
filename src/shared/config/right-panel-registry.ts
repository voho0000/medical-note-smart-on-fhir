// Right Panel Feature Registry - Central configuration for right panel features
// This allows contributors to easily add/remove/replace features in the right panel

export interface RightPanelFeatureConfig {
  id: string
  name: string
  /** The tab label (supports i18n key or direct string) */
  tabLabel: string
  /** Display order (lower = first) */
  order: number
  /** Whether this feature is enabled */
  enabled: boolean
  /**
   * Default tab-bar placement (default true). false = starts in the "more"
   * overflow menu. Users can override per feature via the right-panel-tabs
   * store ("customize pinned tabs" in the more menu).
   */
  pinned?: boolean
  /**
   * Always pinned: rendered after the "more" menu and excluded from the
   * customize list (user overrides are ignored). Used by settings so the
   * pin-management entry point can never hide itself.
   */
  pinLocked?: boolean
  /** Render the tab trigger icon-only at every width (name kept in title/aria). */
  iconOnly?: boolean
  /** Optional: force mount the tab content (useful for chat to preserve state) */
  forceMount?: boolean
  /** Optional: custom wrapper className for the tab content */
  contentClassName?: string
}

/**
 * Right Panel Features Registry
 *
 * Components are NOT part of this config — they are mapped by id (and
 * lazy-loaded) in RightPanelLayout's FEATURE_COMPONENTS.
 *
 * To add a new feature:
 * 1. Create your feature component in features/your-feature/
 * 2. Add an entry here (id, tabLabel, order) with enabled: true
 * 3. Register the component in FEATURE_COMPONENTS in RightPanelLayout.tsx
 *
 * To remove a feature: set enabled: false.
 */
export const RIGHT_PANEL_FEATURES: RightPanelFeatureConfig[] = [
  {
    // Zero-click AI briefing (narrative + safety + decisions + timeline).
    // First tab AND the app's default landing tab; set enabled: false to
    // unplug it — RightPanelLayout falls back to the first enabled feature.
    id: 'medical-summary',
    name: 'Medical Summary',
    tabLabel: 'medicalSummary',
    order: 0,
    enabled: true,
    // AI result + scroll position must survive tab switches (result is also
    // cached, but forceMount avoids re-running effects on every visit).
    forceMount: true,
    contentClassName: 'flex-1 mt-1',
  },
  {
    id: 'medical-chat',
    name: 'Medical Chat',
    tabLabel: 'noteChat', // i18n key from translations
    order: 1,
    enabled: true,
    forceMount: true,
    contentClassName: 'flex-1 overflow-hidden mt-1',
  },
  {
    // Configuration-type feature (per-consumer data scopes) — set up once,
    // rarely touched mid-consult, so it defaults to the overflow menu.
    id: 'data-selection',
    name: 'Data Selection',
    tabLabel: 'dataSelection',
    order: 2,
    enabled: true,
    pinned: false,
    contentClassName: 'flex-1 mt-1',
  },
  {
    // Custom-prompt workbench; its recurring-analysis role is being absorbed
    // by medical-summary, so it defaults to the overflow menu.
    id: 'clinical-insights',
    name: 'Clinical Insights',
    tabLabel: 'clinicalInsights',
    order: 3,
    enabled: true,
    pinned: false,
    forceMount: true,
    contentClassName: 'flex-1 mt-1',
  },
  {
    id: 'ips-export',
    name: 'IPS Export',
    tabLabel: 'ipsExport',
    order: 5,
    enabled: true,
    // AI-inferred suggestions + per-item confirmations are expensive (LLM call)
    // and clinically reviewed state — they must survive tab switches.
    // useInferredProblems resets them when the loaded patient changes.
    forceMount: true,
    contentClassName: 'flex-1 mt-1',
  },
  {
    id: 'medical-calculator',
    name: 'Medical Calculator',
    tabLabel: 'medicalCalculator',
    order: 4,
    enabled: true,
    contentClassName: 'flex-1 mt-1',
  },
  {
    // Gear tab: always the right-most trigger (after the "more" menu), never
    // hideable — it stays reachable no matter how tabs are customized.
    id: 'settings',
    name: 'Settings',
    tabLabel: 'settings',
    order: 6,
    enabled: true,
    pinLocked: true,
    iconOnly: true,
    contentClassName: 'flex-1 mt-1',
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

// NOTE: the former registerRightPanelFeature/disableRightPanelFeature runtime
// mutators were removed — they mutated this module-level array with no React
// reactivity, so calling them never re-rendered the panel. Edit the array above
// (build-time config) instead.
