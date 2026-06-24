import {
  DEFAULT_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
  DATA_SELECTION_PRESETS,
  resolveActivePreset,
  STORAGE_KEYS
} from '@/src/shared/constants/data-selection.constants'

describe('data-selection.constants', () => {
  describe('resolveActivePreset — always exactly one of 通用/初診/追蹤', () => {
    it('the general baseline (= default) resolves to general', () => {
      expect(resolveActivePreset(DEFAULT_DATA_SELECTION, DEFAULT_DATA_FILTERS)).toBe('general')
    })

    it('an exact 初診 profile resolves to newPatient', () => {
      const p = DATA_SELECTION_PRESETS.newPatient
      expect(resolveActivePreset(p.selection, p.filters)).toBe('newPatient')
    })

    it('an exact 追蹤 profile resolves to followUp', () => {
      const p = DATA_SELECTION_PRESETS.followUp
      expect(resolveActivePreset(p.selection, p.filters)).toBe('followUp')
    })

    it('a hand-tuned profile falls back to general (never null)', () => {
      const tuned = { ...DEFAULT_DATA_SELECTION, immunizations: false } // off the baseline
      expect(resolveActivePreset(tuned, DEFAULT_DATA_FILTERS)).toBe('general')
    })

    it('初診 is distinct from the general baseline (其他觀察 on)', () => {
      expect(DATA_SELECTION_PRESETS.newPatient.selection.observations).toBe(true)
      expect(DEFAULT_DATA_SELECTION.observations).toBe(false)
    })

    it('the documents toggle is sticky — it does NOT change the active preset', () => {
      const p = DATA_SELECTION_PRESETS.newPatient
      // 初診 with documents either way still resolves to newPatient
      expect(resolveActivePreset({ ...p.selection, documents: true }, p.filters)).toBe('newPatient')
      expect(resolveActivePreset({ ...p.selection, documents: false }, p.filters)).toBe('newPatient')
      // general baseline with documents on still resolves to general
      expect(resolveActivePreset({ ...DEFAULT_DATA_SELECTION, documents: true }, DEFAULT_DATA_FILTERS)).toBe('general')
    })
  })
  describe('DEFAULT_DATA_SELECTION', () => {
    it('should have all data categories defined', () => {
      expect(DEFAULT_DATA_SELECTION.patientInfo).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.vitalSigns).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.problemList).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.encounters).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.labReports).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.imagingReports).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.procedures).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.observations).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.medications).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.allergies).toBeDefined()
      expect(DEFAULT_DATA_SELECTION.immunizations).toBeDefined()
    })

    it('should default orphan observations OFF (low-signal noise)', () => {
      expect(DEFAULT_DATA_SELECTION.observations).toBe(false)
    })

    it('should default advance directives ON (safety-critical)', () => {
      expect(DEFAULT_DATA_SELECTION.advanceDirectives).toBe(true)
    })

    it('should default documents ON (latest admission summary, bounded by documentMode)', () => {
      expect(DEFAULT_DATA_SELECTION.documents).toBe(true)
    })
  })

  describe('DEFAULT_DATA_FILTERS', () => {
    it('should have all filter options defined', () => {
      expect(DEFAULT_DATA_FILTERS.problemListStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.medicationStatus).toBe('active')
      expect(DEFAULT_DATA_FILTERS.medicationChronic).toBe('all')
      expect(DEFAULT_DATA_FILTERS.medicationTimeRange).toBe('6m')
      expect(DEFAULT_DATA_FILTERS.labReportVersion).toBe('all')
      expect(DEFAULT_DATA_FILTERS.labReportTimeRange).toBe('6m')
      expect(DEFAULT_DATA_FILTERS.imagingReportVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.imagingReportTimeRange).toBe('1y')
      expect(DEFAULT_DATA_FILTERS.vitalSignsVersion).toBe('latest')
      expect(DEFAULT_DATA_FILTERS.vitalSignsTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.procedureVersion).toBe('all')
      expect(DEFAULT_DATA_FILTERS.procedureTimeRange).toBe('all')
      expect(DEFAULT_DATA_FILTERS.problemListTimeRange).toBe('all')
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
