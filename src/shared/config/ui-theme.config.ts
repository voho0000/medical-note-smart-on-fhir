/**
 * UI Theme Configuration
 * Unified color system for consistent visual design across the application
 * All colors support both light and dark modes
 */

import { 
  MessageSquare, 
  Lightbulb, 
  Settings, 
  CheckSquare,
  Stethoscope,
  FileText,
  Pill,
  Calendar,
  Activity,
  AlertTriangle,
  ClipboardList,
  Library,
  User,
  type LucideIcon
} from 'lucide-react'

// ============================================================================
// COLOR DEFINITIONS - Consistent with Prompt Gallery
// ============================================================================

export const UI_COLORS = {
  // Chat / 筆記對話 - Blue (matches Prompt Gallery Chat type)
  chat: {
    light: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-l-blue-500',
      activeBg: 'bg-blue-100',
      activeText: 'text-blue-700',
    },
    dark: {
      bg: 'dark:bg-blue-900/50',
      text: 'dark:text-blue-300',
      border: 'border-l-blue-500',
      activeBg: 'dark:bg-blue-900/50',
      activeText: 'dark:text-blue-300',
    },
  },
  
  // Insight / 臨床洞察 - Violet (matches Prompt Gallery Insight type)
  insight: {
    light: {
      bg: 'bg-violet-100',
      text: 'text-violet-700',
      border: 'border-l-violet-500',
      activeBg: 'bg-violet-100',
      activeText: 'text-violet-700',
    },
    dark: {
      bg: 'dark:bg-violet-900/50',
      text: 'dark:text-violet-300',
      border: 'border-l-violet-500',
      activeBg: 'dark:bg-violet-900/50',
      activeText: 'dark:text-violet-300',
    },
  },
  
  // Clinical Data / 臨床資料 - Emerald/Green
  clinical: {
    light: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-700',
      border: 'border-l-emerald-500',
      activeBg: 'bg-emerald-100',
      activeText: 'text-emerald-700',
    },
    dark: {
      bg: 'dark:bg-emerald-900/50',
      text: 'dark:text-emerald-300',
      border: 'border-l-emerald-500',
      activeBg: 'dark:bg-emerald-900/50',
      activeText: 'dark:text-emerald-300',
    },
  },
  
  // Data Selection / 資料選擇 - Amber
  selection: {
    light: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      border: 'border-l-amber-500',
      activeBg: 'bg-amber-100',
      activeText: 'text-amber-700',
    },
    dark: {
      bg: 'dark:bg-amber-900/50',
      text: 'dark:text-amber-300',
      border: 'border-l-amber-500',
      activeBg: 'dark:bg-amber-900/50',
      activeText: 'dark:text-amber-300',
    },
  },
  
  // Settings / 設定 - Slate/Gray
  settings: {
    light: {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-l-slate-500',
      activeBg: 'bg-slate-100',
      activeText: 'text-slate-700',
    },
    dark: {
      bg: 'dark:bg-slate-800/50',
      text: 'dark:text-slate-300',
      border: 'border-l-slate-500',
      activeBg: 'dark:bg-slate-800/50',
      activeText: 'dark:text-slate-300',
    },
  },
} as const

// ============================================================================
// TAB CONFIGURATIONS - Right Panel
// ============================================================================

export interface TabThemeConfig {
  id: string
  icon: LucideIcon
  colorKey: keyof typeof UI_COLORS
}

export const RIGHT_PANEL_TAB_THEMES: Record<string, TabThemeConfig> = {
  'medical-chat': {
    id: 'medical-chat',
    icon: MessageSquare,
    colorKey: 'chat',
  },
  'data-selection': {
    id: 'data-selection',
    icon: CheckSquare,
    colorKey: 'selection',
  },
  'clinical-insights': {
    id: 'clinical-insights',
    icon: Lightbulb,
    colorKey: 'insight',
  },
  'settings': {
    id: 'settings',
    icon: Settings,
    colorKey: 'settings',
  },
}

// ============================================================================
// TAB CONFIGURATIONS - Left Panel
// ============================================================================

export const LEFT_PANEL_TAB_THEMES: Record<string, TabThemeConfig> = {
  'patient': {
    id: 'patient',
    icon: Stethoscope,
    colorKey: 'clinical',
  },
  'reports': {
    id: 'reports',
    icon: FileText,
    colorKey: 'clinical',
  },
  'meds': {
    id: 'meds',
    icon: Pill,
    colorKey: 'clinical',
  },
  'visits': {
    id: 'visits',
    icon: Calendar,
    colorKey: 'clinical',
  },
}

// ============================================================================
// FEATURE CARD CONFIGURATIONS
// ============================================================================

export const FEATURE_CARD_THEMES: Record<string, { icon: LucideIcon; colorKey: keyof typeof UI_COLORS }> = {
  'patient-info': { icon: User, colorKey: 'clinical' },
  'vitals': { icon: Activity, colorKey: 'clinical' },
  'diagnosis': { icon: ClipboardList, colorKey: 'clinical' },
  'allergies': { icon: AlertTriangle, colorKey: 'clinical' },
  'medications': { icon: Pill, colorKey: 'clinical' },
  'reports': { icon: FileText, colorKey: 'clinical' },
  'visit-history': { icon: Calendar, colorKey: 'clinical' },
}

// ============================================================================
// CENTRALIZED STYLE CLASSES
// These are static strings for Tailwind JIT to properly detect
// ============================================================================

/**
 * Tab active state classes - use these directly in TabsTrigger components
 * Light mode: colored backgrounds
 * Dark mode: subtle backgrounds with ring borders
 */
export const TAB_ACTIVE_CLASSES = {
  chat: 'data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-500/10 dark:data-[state=active]:text-blue-400 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-blue-500/30',
  insight: 'data-[state=active]:bg-violet-100 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-500/10 dark:data-[state=active]:text-violet-400 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-violet-500/30',
  selection: 'data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-500/10 dark:data-[state=active]:text-amber-400 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-amber-500/30',
  settings: 'data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-500/10 dark:data-[state=active]:text-slate-300 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-slate-500/30',
  clinical: 'data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-500/10 dark:data-[state=active]:text-emerald-400 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-emerald-500/30',
} as const

/**
 * Card left border classes - use these directly in Card components
 */
export const CARD_BORDER_CLASSES = {
  chat: 'border-l-4 border-l-blue-500',
  insight: 'border-l-4 border-l-violet-500',
  selection: 'border-l-4 border-l-amber-500',
  settings: 'border-l-4 border-l-slate-500',
  clinical: 'border-l-4 border-l-emerald-500',
} as const

/**
 * Badge classes for different panel types
 */
export const BADGE_CLASSES = {
  chat: 'bg-blue-200 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400 border-0',
  insight: 'bg-violet-200 text-violet-800 dark:bg-violet-500/20 dark:text-violet-400 border-0',
  selection: 'bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border-0',
  settings: 'bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-400 border-0',
  clinical: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border-0',
} as const

// Type for panel keys
export type PanelType = keyof typeof TAB_ACTIVE_CLASSES

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get tab active classes for a panel type
 */
export function getTabClasses(panel: PanelType): string {
  return TAB_ACTIVE_CLASSES[panel]
}

/**
 * Get card border classes for a panel type
 */
export function getCardClasses(panel: PanelType): string {
  return CARD_BORDER_CLASSES[panel]
}

/**
 * Get badge classes for a panel type
 */
export function getBadgeClasses(panel: PanelType): string {
  return BADGE_CLASSES[panel]
}

// Legacy helper functions for backward compatibility
/**
 * @deprecated Use getTabClasses() instead
 */
export function getActiveTabClasses(colorKey: keyof typeof UI_COLORS): string {
  return TAB_ACTIVE_CLASSES[colorKey] || TAB_ACTIVE_CLASSES.settings
}

/**
 * @deprecated Use getCardClasses() instead
 */
export function getBorderClass(colorKey: keyof typeof UI_COLORS): string {
  return UI_COLORS[colorKey].light.border
}
