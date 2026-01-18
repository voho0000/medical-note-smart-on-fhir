import {
  DEFAULT_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
  STORAGE_KEYS
} from '@/src/shared/constants/data-selection.constants'

describe('data-selection.constants', () => {
  describe('DEFAULT_DATA_SELECTION', () => {
    it('should have all data categories defined', () => {
      expect(DEFAULT_DATA_SELECTION.patientInfo).toBe(true)
      expect(DEFAULT_DATA_SELECTION.conditions).toBe(true)
      expect(DEFAULT_DATA_SELECTION.medications).toBe(true)
      expect(DEFAULT_DATA_SELECTION.allergies).toBe(true)
      expect(DEFAULT_DATA_SELECTION.diagnosticReports).toBe(true)
      expect(DEFAULT_DATA_SELECTION.labReports).toBe(true)
      expect(DEFAULT_DATA_SELECTION.imagingReports).toBe(true)
      expect(DEFAULT_DATA_SELECTION.procedures).toBe(true)
      expect(DEFAULT_DATA_SELECTION.observations).toBe(true)
    })

    it('should have all categories enabled by default', () => {
      const values = Object.values(DEFAULT_DATA_SELECTION)
      expect(values.every(v => v === true)).toBe(true)
    })
  })

  describe('DEFAULT_DATA_FILTERS', () => {
    it('should have all filter options defined', () => {
      expect(DEFAULT_DATA_FILTERS.conditionStatus).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.medicationStatus).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.reportInclusion).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.reportTimeRange).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.labReportVersion).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.labReportTimeRange).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.imagingReportVersion).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.imagingReportTimeRange).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.vitalSignsVersion).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.vitalSignsTimeRange).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.procedureVersion).toBeDefined()
      expect(DEFAULT_DATA_FILTERS.procedureTimeRange).toBeDefined()
    })

    it('should have correct default filter values', () => {
      expect(DEFAULT_DATA_FILTERS.conditionStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.medicationStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.reportInclusion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.reportTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.labReportVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.labReportTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.imagingReportVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.imagingReportTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.vitalSignsVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.vitalSignsTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.procedureVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.procedureTimeRange).toBe('all')
    })
  })

  describe('STORAGE_KEYS', () => {
    it('should have all storage keys defined', () => {
      expect(STORAGE_KEYS.DATA_SELECTION).toBe('clinicalDataSelection')
      expect(STORAGE_KEYS.DATA_FILTERS).toBe('clinicalDataFilters')
      expect(STORAGE_KEYS.MODEL_SELECTION).toBe('clinical-note:model')
      expect(STORAGE_KEYS.API_KEY).toBe('clinical-note:openai-key')
      expect(STORAGE_KEYS.GEMINI_KEY).toBe('clinical-note:gemini-key')
      expect(STORAGE_KEYS.PERPLEXITY_KEY).toBe('clinical-note:perplexity-key')
      expect(STORAGE_KEYS.PROMPT_TEMPLATES).toBe('medical-chat-prompt-templates')
      expect(STORAGE_KEYS.CLINICAL_INSIGHTS_PANELS).toBe('clinical-insights-panels')
      expect(STORAGE_KEYS.CLINICAL_INSIGHTS_AUTO_GENERATE).toBe('clinical-insights-auto-generate')
    })

    it('should have unique storage keys', () => {
      const keys = Object.values(STORAGE_KEYS)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })
  })
})
