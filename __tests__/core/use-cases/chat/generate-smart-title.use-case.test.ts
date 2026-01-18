import { GenerateSmartTitleUseCase } from '@/src/core/use-cases/chat/generate-smart-title.use-case'
import type { GenerateSmartTitleOptions } from '@/src/core/use-cases/chat/generate-smart-title.use-case'

// Mock OpenAiService
jest.mock('@/src/infrastructure/ai/services/openai.service')

describe('GenerateSmartTitleUseCase', () => {
  let useCase: GenerateSmartTitleUseCase

  beforeEach(() => {
    useCase = new GenerateSmartTitleUseCase()
    jest.clearAllMocks()
  })

  describe('execute', () => {
    it('should generate title in English', async () => {
      const options: GenerateSmartTitleOptions = {
        userMessage: 'What are the symptoms of diabetes?',
        assistantMessage: 'Common symptoms include increased thirst...',
        locale: 'en',
        apiKey: 'test-key'
      }

      // Mock will return undefined, triggering fallback
      const result = await useCase.execute(options)
      
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(25)
    })

    it('should generate title in Chinese', async () => {
      const options: GenerateSmartTitleOptions = {
        userMessage: '糖尿病的症狀是什麼？',
        assistantMessage: '常見症狀包括口渴增加...',
        locale: 'zh-TW',
        apiKey: 'test-key'
      }

      const result = await useCase.execute(options)
      
      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(12)
    })

    it('should fallback to user message on error', async () => {
      const options: GenerateSmartTitleOptions = {
        userMessage: 'Test question about medical topic',
        assistantMessage: 'Test answer',
        locale: 'en',
        apiKey: null
      }

      const result = await useCase.execute(options)
      
      expect(result).toBe('Test question about medic')
      expect(result.length).toBeLessThanOrEqual(25)
    })

    it('should truncate long fallback titles in English', async () => {
      const longMessage = 'This is a very long message that should be truncated to fit within the maximum length'
      const options: GenerateSmartTitleOptions = {
        userMessage: longMessage,
        assistantMessage: 'Answer',
        locale: 'en',
        apiKey: null
      }

      const result = await useCase.execute(options)
      
      expect(result.length).toBeLessThanOrEqual(25)
    })

    it('should truncate long fallback titles in Chinese', async () => {
      const longMessage = '這是一個非常長的訊息應該要被截斷以符合最大長度限制'
      const options: GenerateSmartTitleOptions = {
        userMessage: longMessage,
        assistantMessage: '回答',
        locale: 'zh-TW',
        apiKey: null
      }

      const result = await useCase.execute(options)
      
      expect(result.length).toBeLessThanOrEqual(12)
    })

    it('should handle empty API key', async () => {
      const options: GenerateSmartTitleOptions = {
        userMessage: 'Question',
        assistantMessage: 'Answer',
        locale: 'en',
        apiKey: null
      }

      const result = await useCase.execute(options)
      
      expect(result).toBeDefined()
    })

    it('should handle short messages', async () => {
      const options: GenerateSmartTitleOptions = {
        userMessage: 'Hi',
        assistantMessage: 'Hello',
        locale: 'en',
        apiKey: 'test-key'
      }

      const result = await useCase.execute(options)
      
      expect(result).toBeDefined()
    })
  })

  describe('prompt generation', () => {
    it('should truncate long messages in prompts', async () => {
      const longMessage = 'A'.repeat(300)
      const options: GenerateSmartTitleOptions = {
        userMessage: longMessage,
        assistantMessage: longMessage,
        locale: 'en',
        apiKey: null
      }

      const result = await useCase.execute(options)
      
      expect(result).toBeDefined()
    })
  })
})
