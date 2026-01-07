// Data Selection Constants
import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

export const DEFAULT_DATA_SELECTION: DataSelection = {
  patientInfo: true,
  conditions: true,
  medications: true,
  allergies: true,
  diagnosticReports: true,
  procedures: true,
  observations: true
}

export const DEFAULT_DATA_FILTERS: DataFilters = {
  conditionStatus: 'active',
  medicationStatus: 'active',
  reportInclusion: 'latest',
  reportTimeRange: 'all',
  labReportVersion: 'latest',
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: 'all'
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
