import { BuildAgentSystemPromptUseCase } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'
import type { BuildAgentSystemPromptInput } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'

describe('BuildAgentSystemPromptUseCase', () => {
  let useCase: BuildAgentSystemPromptUseCase

  const mockTranslations = {
    deepModeIntro: 'Deep Mode',
    currentPatient: 'Current Patient',
    patientId: 'Patient ID',
    hasPermission: 'Has Permission',
    organizedClinicalData: 'Clinical Data',
    organizedClinicalDataDesc: 'Organized data',
    availableTools: 'Available Tools',
    availableToolsPrefix: 'Tools:',
    availableToolsSuffix: 'End tools',
    toolDescriptions: {
      queryConditions: 'Query conditions',
      queryMedications: 'Query medications',
      queryAllergies: 'Query allergies',
      queryDiagnosticReports: 'Query reports',
      queryObservations: 'Query observations',
      queryProcedures: 'Query procedures',
      queryEncounters: 'Query encounters',
      searchMedicalLiterature: 'Search literature'
    },
    importantNote: 'Important',
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

    it('should include patient ID when provided', () => {
      const input: BuildAgentSystemPromptInput = {
        baseSystemPrompt: 'Base prompt',
        clinicalContext: 'Clinical data',
        patientId: 'patient-123',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      // The prompt includes patient ID label, not the actual ID value
      expect(result).toContain('Patient ID')
      expect(result).toContain('Clinical data')
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
        patientId: 'patient-123',
        hasPerplexityKey: false,
        translations: mockTranslations
      }

      const result = useCase.execute(input)

      expect(result).toContain('Guidelines')
      expect(result).toContain('Prioritize data')
    })
  })
})
