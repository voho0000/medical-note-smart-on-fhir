// Feature Registry - Central configuration for all clinical summary features
import { ComponentType } from 'react'
import { PatientInfoCard } from '@/features/clinical-summary/patient-info/PatientInfoCard'
import { VitalsCard } from '@/features/clinical-summary/vitals/VitalsCard'
import { MedListCard } from '@/features/clinical-summary/medications/MedListCard'
import { AllergiesCard } from '@/features/clinical-summary/allergies/AllergiesCard'
import { DiagnosesCard } from '@/features/clinical-summary/diagnosis/DiagnosisCard'
import { ReportsCard } from '@/features/clinical-summary/reports/ReportsCard'

export interface FeatureConfig {
  id: string
  name: string
  component: ComponentType
  order: number
  enabled: boolean
}

export const CLINICAL_SUMMARY_FEATURES: FeatureConfig[] = [
  {
    id: 'patient-info',
    name: 'Patient Information',
    component: PatientInfoCard,
    order: 0,
    enabled: true,
  },
  {
    id: 'vitals',
    name: 'Vital Signs',
    component: VitalsCard,
    order: 1,
    enabled: true,
  },
  {
    id: 'medications',
    name: 'Medications',
    component: MedListCard,
    order: 2,
    enabled: true,
  },
  {
    id: 'allergies',
    name: 'Allergies & Intolerances',
    component: AllergiesCard,
    order: 3,
    enabled: true,
  },
  {
    id: 'diagnosis',
    name: 'Diagnosis / Problem List',
    component: DiagnosesCard,
    order: 4,
    enabled: true,
  },
  {
    id: 'reports',
    name: 'Reports',
    component: ReportsCard,
    order: 5,
    enabled: true,
  },
]

/**
 * Get enabled features sorted by order
 */
export function getEnabledFeatures(): FeatureConfig[] {
  return CLINICAL_SUMMARY_FEATURES
    .filter(feature => feature.enabled)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get feature by ID
 */
export function getFeatureById(id: string): FeatureConfig | undefined {
  return CLINICAL_SUMMARY_FEATURES.find(feature => feature.id === id)
}
