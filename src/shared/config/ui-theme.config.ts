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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get combined Tailwind classes for a color theme (active state)
 */
export function getActiveTabClasses(colorKey: keyof typeof UI_COLORS): string {
  const color = UI_COLORS[colorKey]
  return `data-[state=active]:${color.light.activeBg} data-[state=active]:${color.light.activeText} ${color.dark.activeBg.replace('dark:', 'data-[state=active]:dark:')} ${color.dark.activeText.replace('dark:', 'data-[state=active]:dark:')}`
}

/**
 * Get border color class for a color theme
 */
export function getBorderClass(colorKey: keyof typeof UI_COLORS): string {
  return UI_COLORS[colorKey].light.border
}

/**
 * Get badge classes for a color theme
 */
export function getBadgeClasses(colorKey: keyof typeof UI_COLORS): string {
  const color = UI_COLORS[colorKey]
  return `${color.light.bg} ${color.light.text} ${color.dark.bg} ${color.dark.text} border-0`
}
