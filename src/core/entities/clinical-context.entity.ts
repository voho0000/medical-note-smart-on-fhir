// Core Domain Entity: Clinical Context

import type { FilterValue } from '@/src/core/interfaces/data-category.interface'

export type TimeRange = '24h' | '3d' | '1w' | '1m' | '3m' | '6m' | '1y' | '3y' | '5y' | 'all'

export interface ClinicalContextSection {
  title: string
  items: string[]
}

// Re-export FilterValue for convenience
export type { FilterValue }

export interface DataSelection {
  // Patient group
  patientInfo: boolean
  vitalSigns: boolean
  problemList: boolean
  advanceDirectives: boolean // FHIR Consent — DNR / palliative / organ donation
  medicalDevices: boolean    // FHIR Device — implants / DME
  carePlans: boolean         // FHIR CarePlan — plan of care

  // Visit group
  encounters: boolean

  // Reports group
  labReports: boolean
  imagingReports: boolean
  procedures: boolean
  observations: boolean // legacy hidden field; standalone results fold into labReports

  // Medication group
  medications: boolean
  allergies: boolean
  immunizations: boolean

  // Documents group
  documents: boolean // FHIR Composition — full free-text documents
}

export interface DataFilters {
  // Problem list
  problemListStatus: 'active' | 'all'
  problemListTimeRange: TimeRange

  // Encounters / visits
  encounterTimeRange: TimeRange

  // Medications
  medicationStatus: 'active' | 'all'
  medicationChronic: 'all' | 'chronic' | 'acute'
  medicationTimeRange: TimeRange

  // Reports / observations
  labReportVersion: 'latest' | 'all'
  labReportTimeRange: TimeRange
  imagingReportVersion: 'latest' | 'all'
  imagingReportTimeRange: TimeRange
  vitalSignsVersion: 'latest' | 'all'
  vitalSignsTimeRange: TimeRange
  procedureVersion: 'latest' | 'all'
  procedureTimeRange: TimeRange
  observationVersion: 'latest' | 'all'
  observationTimeRange: TimeRange

  // Immunizations
  immunizationTimeRange: TimeRange

  // Care plans
  carePlanStatus: 'active' | 'all'
}

export interface ClinicalContextOptions {
  selection: DataSelection
  filters: DataFilters
  supplementaryNotes?: string
}
