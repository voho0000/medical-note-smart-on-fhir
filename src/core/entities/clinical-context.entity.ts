// Core Domain Entity: Clinical Context

import type { FilterValue } from '@/src/core/interfaces/data-category.interface'

export type TimeRange = '24h' | '3d' | '1w' | '1m' | '3m' | '6m' | '1y' | '3y' | '5y' | 'all' | 'sinceLastVisit'

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
  observations: boolean // standalone non-lab/non-imaging/non-vital Observation records

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
  // 每項目筆數 — 一個檢驗項目最多納入幾筆數值（合併自舊的 labReportVersion +
  // labTrendPoints 兩顆下拉）。'latest' = 每項目最新 1 筆（精簡列）;'3'/'8'/'16'
  // = 樞紐表每項目上限 K 筆;'all' = 每項目全部、不設上限。時間範圍由
  // labReportTimeRange 獨立控制。IPS 匯出額外套 2 年回溯 + 空窗放寬（見
  // ips-curation.ts），與 depth 解耦。
  labDepth: 'latest' | '3' | '8' | '16' | 'all'
  labReportTimeRange: TimeRange
  /**
   * CSV of lab panel ids (cbc/chem/coag/…) to restrict the lab context to.
   * Empty string = all panels. Stored as CSV (not string[]) so it flows through
   * the scalar FilterValue plumbing like every other filter.
   */
  labPanelIds: string
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
}
