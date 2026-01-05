// Feature Registry - Central configuration for all clinical summary features
// Contributors can easily add/remove/replace features by modifying this registry
import { ComponentType } from 'react'
import { PatientInfoCard } from '@/features/clinical-summary/patient-info/PatientInfoCard'
import { VitalsCard } from '@/features/clinical-summary/vitals/VitalsCard'
import { MedListCard } from '@/features/clinical-summary/medications/MedListCard'
import { AllergiesCard } from '@/features/clinical-summary/allergies/AllergiesCard'
import { DiagnosesCard } from '@/features/clinical-summary/diagnosis/DiagnosisCard'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'
import { VisitHistoryCard } from '@/features/clinical-summary/visit-history/VisitHistoryCard'

// ============================================================================
// TAB CONFIGURATION - Define available tabs in the left panel
// ============================================================================
export interface TabConfig {
  id: string
  /** i18n key for tab label */
  labelKey: string
  /** Display order (lower = first) */
  order: number
  /** Whether this tab is enabled */
  enabled: boolean
}

export const LEFT_PANEL_TABS: TabConfig[] = [
  { id: 'patient', labelKey: 'patient', order: 0, enabled: true },
  { id: 'reports', labelKey: 'reports', order: 1, enabled: true },
  { id: 'meds', labelKey: 'medications', order: 2, enabled: true },
  { id: 'visits', labelKey: 'visits', order: 3, enabled: true },
]

// ============================================================================
// FEATURE CONFIGURATION - Define features and which tab they belong to
// ============================================================================
export interface FeatureConfig {
  id: string
  name: string
  component: ComponentType
  /** Which tab this feature belongs to */
  tab: string
  /** Display order within the tab (lower = first) */
  order: number
  /** Whether this feature is enabled */
  enabled: boolean
}

export const CLINICAL_SUMMARY_FEATURES: FeatureConfig[] = [
  // Patient Tab Features
  {
    id: 'patient-info',
    name: 'Patient Information',
    component: PatientInfoCard,
    tab: 'patient',
    order: 0,
    enabled: true,
  },
  {
    id: 'vitals',
    name: 'Vital Signs',
    component: VitalsCard,
    tab: 'patient',
    order: 1,
    enabled: true,
  },
  {
    id: 'diagnosis',
    name: 'Diagnosis / Problem List',
    component: DiagnosesCard,
    tab: 'patient',
    order: 2,
    enabled: true,
  },
  // Reports Tab Features
  {
    id: 'reports',
    name: 'Reports',
    component: ReportsCard,
    tab: 'reports',
    order: 0,
    enabled: true,
  },
  // Medications Tab Features
  {
    id: 'allergies',
    name: 'Allergies & Intolerances',
    component: AllergiesCard,
    tab: 'meds',
    order: 0,
    enabled: true,
  },
  {
    id: 'medications',
    name: 'Medications',
    component: MedListCard,
    tab: 'meds',
    order: 1,
    enabled: true,
  },
  // Visits Tab Features
  {
    id: 'visit-history',
    name: 'Visit History',
    component: VisitHistoryCard,
    tab: 'visits',
    order: 0,
    enabled: true,
  },
]

/**
 * Get enabled tabs sorted by order
 */
export function getEnabledTabs(): TabConfig[] {
  return LEFT_PANEL_TABS
    .filter(tab => tab.enabled)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get enabled features sorted by order
 */
export function getEnabledFeatures(): FeatureConfig[] {
  return CLINICAL_SUMMARY_FEATURES
    .filter(feature => feature.enabled)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get enabled features for a specific tab
 */
export function getFeaturesForTab(tabId: string): FeatureConfig[] {
  return CLINICAL_SUMMARY_FEATURES
    .filter(feature => feature.enabled && feature.tab === tabId)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get feature by ID
 */
export function getFeatureById(id: string): FeatureConfig | undefined {
  return CLINICAL_SUMMARY_FEATURES.find(feature => feature.id === id)
}

/**
 * Register a new feature dynamically
 */
export function registerFeature(feature: FeatureConfig): void {
  const existingIndex = CLINICAL_SUMMARY_FEATURES.findIndex(f => f.id === feature.id)
  if (existingIndex >= 0) {
    CLINICAL_SUMMARY_FEATURES[existingIndex] = feature
  } else {
    CLINICAL_SUMMARY_FEATURES.push(feature)
  }
}

/**
 * Disable a feature by ID
 */
export function disableFeature(id: string): void {
  const feature = CLINICAL_SUMMARY_FEATURES.find(f => f.id === id)
  if (feature) {
    feature.enabled = false
  }
}
