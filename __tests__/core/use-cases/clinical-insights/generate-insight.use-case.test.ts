import { GenerateInsightUseCase } from '@/src/core/use-cases/clinical-insights/generate-insight.use-case'
import type { GenerateInsightInput } from '@/src/core/use-cases/clinical-insights/generate-insight.use-case'

describe('GenerateInsightUseCase', () => {
  let useCase: GenerateInsightUseCase

  beforeEach(() => {
    useCase = new GenerateInsightUseCase()
  })

  describe('buildMessages', () => {
    it('should build messages with system instruction', () => {
      const input: GenerateInsightInput = {
        prompt: 'Analyze patient vitals',
        clinicalContext: 'BP: 140/90, HR: 85',
        modelId: 'gpt-4'
      }

      const messages = useCase.buildMessages(input)

      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('clinical assistant')
    })

    it('should include prompt and clinical context in user message', () => {
      const input: GenerateInsightInput = {
        prompt: 'Analyze patient vitals',
        clinicalContext: 'BP: 140/90, HR: 85',
        modelId: 'gpt-4'
      }

      const messages = useCase.buildMessages(input)

      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toContain('Analyze patient vitals')
      expect(messages[1].content).toContain('BP: 140/90, HR: 85')
      expect(messages[1].content).toContain('Patient Clinical Context')
    })

    it('should handle empty clinical context', () => {
      const input: GenerateInsightInput = {
        prompt: 'General inquiry',
        clinicalContext: '',
        modelId: 'gpt-4'
      }

      const messages = useCase.buildMessages(input)

      expect(messages).toHaveLength(2)
      expect(messages[1].content).toContain('General inquiry')
    })

    it('should handle long prompts', () => {
      const longPrompt = 'A'.repeat(1000)
      const input: GenerateInsightInput = {
        prompt: longPrompt,
        clinicalContext: 'Context',
        modelId: 'gpt-4'
      }

      const messages = useCase.buildMessages(input)

      expect(messages[1].content).toContain(longPrompt)
    })

    it('should handle special characters in prompt', () => {
      const input: GenerateInsightInput = {
        prompt: 'What is the patient\'s "condition"?',
        clinicalContext: 'Test & context',
        modelId: 'gpt-4'
      }

      const messages = useCase.buildMessages(input)

      expect(messages[1].content).toContain('What is the patient\'s "condition"?')
      expect(messages[1].content).toContain('Test & context')
    })
  })
})
