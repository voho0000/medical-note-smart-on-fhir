// Core Domain Entity: Clinical Context

import type { FilterValue } from '@/src/core/interfaces/data-category.interface'

export type TimeRange = '24h' | '3d' | '1w' | '1m' | '3m' | '6m' | '1y' | 'all'

export interface ClinicalContextSection {
  title: string
  items: string[]
}

// Re-export FilterValue for convenience
export type { FilterValue }

export interface DataSelection {
  patientInfo: boolean
  conditions: boolean
  medications: boolean
  allergies: boolean
  diagnosticReports: boolean  // Legacy - kept for backward compatibility
  labReports: boolean
  imagingReports: boolean
  procedures: boolean
  observations: boolean
}

export interface DataFilters {
  conditionStatus: 'active' | 'all'
  medicationStatus: 'active' | 'all'
  reportInclusion: 'latest' | 'all'
  reportTimeRange: TimeRange
  labReportVersion: 'latest' | 'all'
  labReportTimeRange: TimeRange
  imagingReportVersion: 'latest' | 'all'
  imagingReportTimeRange: TimeRange
  vitalSignsVersion: 'latest' | 'all'
  vitalSignsTimeRange: TimeRange
  procedureVersion: 'latest' | 'all'
  procedureTimeRange: TimeRange
}

export interface ClinicalContextOptions {
  selection: DataSelection
  filters: DataFilters
  supplementaryNotes?: string
}
