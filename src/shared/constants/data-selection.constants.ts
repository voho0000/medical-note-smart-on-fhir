// Data Selection Constants
// Default selection / filters for the right-side Data Selection panel.

import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

export const DEFAULT_DATA_SELECTION: DataSelection = {
  // Patient group
  patientInfo: true,
  vitalSigns: true,
  problemList: true,

  // Visit group
  encounters: true,
  conditions: false,        // Off — encounter view already covers per-visit diagnoses

  // Reports group
  labReports: true,
  imagingReports: true,
  procedures: true,
  observations: false,      // Orphan observations — off by default (low signal)

  // Medication group
  medications: true,
  allergies: true,
  immunizations: true,
}

export const DEFAULT_DATA_FILTERS: DataFilters = {
  conditionStatus: 'active',
  problemListStatus: 'active',
  medicationStatus: 'active',
  medicationChronic: 'all',
  medicationTimeRange: 'all',
  labReportVersion: 'latest',
  labReportTimeRange: 'all',
  imagingReportVersion: 'latest',
  imagingReportTimeRange: 'all',
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: 'all',
  procedureVersion: 'latest',
  procedureTimeRange: 'all',
  immunizationTimeRange: 'all',
}

export const STORAGE_KEYS = {
  DATA_SELECTION: 'clinicalDataSelection',
  DATA_FILTERS: 'clinicalDataFilters',
  MODEL_SELECTION: 'clinical-note:model',
  API_KEY: 'clinical-note:openai-key',
  GEMINI_KEY: 'clinical-note:gemini-key',
  PERPLEXITY_KEY: 'clinical-note:perplexity-key',
  PROMPT_TEMPLATES: 'medical-chat-prompt-templates',
  CLINICAL_INSIGHTS_PANELS: 'clinical-insights-panels',
  CLINICAL_INSIGHTS_AUTO_GENERATE: 'clinical-insights-auto-generate'
} as const
