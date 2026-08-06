import { BuildAgentSystemPromptUseCase } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'
import type { BuildAgentSystemPromptInput } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'

describe('BuildAgentSystemPromptUseCase', () => {
  let useCase: BuildAgentSystemPromptUseCase

  const mockTranslations = {
    deepModeIntro: 'Deep Mode',
    currentPatient: 'Current Patient',
    hasPermission: 'Has Permission',
    organizedClinicalData: 'Clinical Data',
    organizedClinicalDataDesc: 'Organized data',
    availableTools: 'Available Tools',
    availableToolsPrefix: 'Tools:',
    availableToolsSuffix: 'End tools',
    toolDescriptions: {
      queryPatientInfo: 'Query patient info',
      getDataOverview: 'Get overview',
      queryEncounters: 'Query encounters',
      getRecentVisits: 'Get recent visits',
      getEncounterDetails: 'Get encounter details',
      listEncounterDepartments: 'List departments',
      queryConditions: 'Query conditions',
      queryObservations: 'Query observations',
      queryDiagnosticReports: 'Query reports',
      queryLabResultsByCategory: 'Query labs by category',
      queryImagingRecords: 'Query imaging records',
      searchObservationByName: 'Search obs by name',
      listAvailableObservationCodes: 'List obs codes',
      queryProcedures: 'Query procedures',
      queryMedications: 'Query medications',
      getActiveMedicationList: 'Get active meds',
      queryAllergies: 'Query allergies',
      queryImmunizations: 'Query immunizations',
      searchMedicalLiterature: 'Search literature'
    },
    importantNote: 'Important',
    icdCodeCaveat: 'ICD caveat',
    groundingSelfCheck: 'Grounding self-check',
    anonymizationNote: 'Anonymized note',
    literatureKeywords: 'Literature keywords',
    usageGuidelines: 'Guidelines',
    prioritizeClinicalData: 'Prioritize data',
    useToolsWhenNeeded: 'Use tools',
    useToolsDirectly: 'Direct use',
    noAuthNeeded: 'No auth',
    mustExplainResults: 'Explain',
    provideAnalysis: 'Analyze',
    indicateNoRecords: 'No records',
    helpWithClinicalData: 'Help data',
    helpWithTools: 'Help tools'
  }

  beforeEach(() => {
    useCase = new BuildAgentSystemPromptUseCase()
  })

  describe('execute', () => {
    it('should build basic system prompt', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Base prompt')
      expect(result).toContain('Query labs by category')
      expect(result).toContain('Query imaging records')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include clinical context when provided', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: 'Patient has diabetes',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Patient has diabetes')
    })

    it('should mark patient context without leaking the FHIR id', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: 'Clinical data',
        hasPatient: true,
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      // Patient section present, but no patient identifier anywhere —
      // the prompt goes to cloud LLM providers on every agent turn
      expect(result).toContain('Current Patient')
      expect(result).toContain('Has Permission')
      expect(result).toContain('Clinical data')
      expect(result).not.toContain('patient-123')
    })

    it('should include Perplexity tool when key is available', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: true,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Search literature')
    })

    it('should not include Perplexity tool when key is not available', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).not.toContain('Search literature')
    })

    it('should include all tool descriptions', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Query conditions')
      expect(result).toContain('Query medications')
      expect(result).toContain('Query allergies')
    })

    it('should list only schemas exposed for the current routed turn', () => {
      const result = useCase.execute({
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: false,
        availableToolNames: ['queryAllergies'],
        translations: mockTranslations,
      })

      expect(result).toContain('Query allergies')
      expect(result).not.toContain('Query medications')
      expect(result).not.toContain('Query reports')
      expect(result).toContain('use the fewest relevant tools')
      expect(result.startsWith('# NON-NEGOTIABLE CLINICAL OUTPUT CONTRACT')).toBe(true)
      expect(result).toContain('Taiwanese Traditional Chinese')
      expect(result).toContain('Never infer a medication')
      expect(result).toContain('use only tool-provided normalityStatus')
    })

    it('should handle empty clinical context', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '   ',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include usage guidelines', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: 'Clinical data',
        hasPatient: true,
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Guidelines')
      expect(result).toContain('Prioritize data')
    })

    it('isolates a general medical question from loaded-patient context', () => {
      const result = useCase.execute({
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPatient: true,
        hasPerplexityKey: false,
        availableToolNames: [],
        turnDataScope: 'general-no-patient',
        translations: mockTranslations,
      })

      expect(result).toContain('general medical-knowledge question')
      expect(result).toContain("Do not use, request, mention, or infer any loaded patient's FHIR data")
      expect(result).not.toContain('Has Permission')
      expect(result).not.toContain('Query patient info')
    })

    it('requires an explicit freshness limitation without a literature tool', () => {
      const result = useCase.execute({
        baseSystemPrompt: 'Base prompt',
        clinicalContext: '',
        hasPerplexityKey: false,
        currentEvidenceUnavailable: true,
        translations: mockTranslations,
      })

      expect(result).toContain('CURRENT-EVIDENCE LIMITATION')
      expect(result).toContain('cannot verify the current version')
      expect(result).toContain('official guideline')
    })
  })
})
