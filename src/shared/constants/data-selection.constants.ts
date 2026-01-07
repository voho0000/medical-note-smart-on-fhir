// Data Selection Constants
// These are kept for backward compatibility
// New code should use dataCategoryRegistry.getDefaultSelection() and getDefaultFilters()

import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

// Legacy default selection - includes both old and new category IDs
export const DEFAULT_DATA_SELECTION: DataSelection = {
  patientInfo: true,
  conditions: true,
  medications: true,
  allergies: true,
  diagnosticReports: true,  // Legacy - kept for backward compatibility
  labReports: true,         // New
  imagingReports: true,     // New
  procedures: true,
  observations: true
}

// Legacy default filters - includes both old and new filter keys
export const DEFAULT_DATA_FILTERS: DataFilters = {
  conditionStatus: 'active',
  medicationStatus: 'active',
  reportInclusion: 'latest',
  reportTimeRange: 'all',
  labReportVersion: 'latest',
  labReportTimeRange: 'all',
  imagingReportVersion: 'latest',
  imagingReportTimeRange: 'all',
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: 'all',
  procedureVersion: 'latest',
  procedureTimeRange: 'all'
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
