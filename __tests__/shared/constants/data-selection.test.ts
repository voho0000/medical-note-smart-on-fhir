import {
  DEFAULT_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
  STORAGE_KEYS
} from '@/src/shared/constants/data-selection.constants'

describe('data-selection.constants', () => {
  describe('DEFAULT_DATA_SELECTION', () => {
    it('should have all data categories defined', () => {
      expect(DEFAULT_DATA_SELECTION.patientInfo).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.vitalSigns).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.problemList).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.encounters).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.conditions).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.labReports).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.imagingReports).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.procedures).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.observations).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.medications).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.allergies).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.immunizations).toBeDefined()
    })

    it('should default conditions OFF (covered by encounters)', () => {
      expect(DEFAULT_DATA_SELECTION.conditions).toBe(false)
    })

    it('should default orphan observations OFF', () => {
      expect(DEFAULT_DATA_SELECTION.observations).toBe(false)
    })
  })

  describe('DEFAULT_DATA_FILTERS', () => {
    it('should have all filter options defined', () => {
      expect(DEFAULT_DATA_FILTERS.conditionStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.problemListStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.medicationStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.medicationChronic).toBe('all')
      expect(DEFAULT_DATA_FILTERS.medicationTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.labReportVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.labReportTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.imagingReportVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.imagingReportTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.vitalSignsVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.vitalSignsTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.procedureVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.procedureTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.immunizationTimeRange).toBe('all')
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
