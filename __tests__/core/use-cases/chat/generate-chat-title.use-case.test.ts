import { GenerateChatTitleUseCase } from '@/src/core/use-cases/chat/generate-chat-title.use-case'
import type { ChatMessage } from '@/src/application/stores/chat.store'

describe('GenerateChatTitleUseCase', () => {
  let useCase: GenerateChatTitleUseCase

  beforeEach(() => {
    useCase = new GenerateChatTitleUseCase()
  })

  describe('execute', () => {
    it('should return "New Conversation" for empty messages', async () => {
      const result = await useCase.execute([])
      expect(result).toBe('New Conversation')
    })

    it('should return "New Conversation" when no user messages', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'Hello', timestamp: Date.now() }
      ]
      const result = await useCase.execute(messages)
      expect(result).toBe('New Conversation')
    })

    it('should use first user message as title when short', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Patient symptoms', timestamp: Date.now() }
      ]
      const result = await useCase.execute(messages)
      expect(result).toBe('Patient symptoms')
    })

    it('should truncate long messages to 50 characters', async () => {
      const longContent = 'This is a very long message that should be truncated to fifty characters'
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: longContent, timestamp: Date.now() }
      ]
      const result = await useCase.execute(messages)
      expect(result).toBe('This is a very long message that should be truncat...')
      expect(result.length).toBe(53) // 50 + '...'
    })

    it('should use AI service when provided', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'What are the symptoms of diabetes?', timestamp: Date.now() }
      ]
      
      const mockAiService = {
        generateText: jest.fn().mockResolvedValue('Diabetes Symptoms Inquiry')
      }
      
      const result = await useCase.execute(messages, mockAiService)
      
      expect(mockAiService.generateText).toHaveBeenCalled()
      expect(result).toBe('Diabetes Symptoms Inquiry')
    })

    it('should remove quotes from AI-generated title', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Patient consultation', timestamp: Date.now() }
      ]
      
      const mockAiService = {
        generateText: jest.fn().mockResolvedValue('"Patient Consultation"')
      }
      
      const result = await useCase.execute(messages, mockAiService)
      expect(result).toBe('Patient Consultation')
    })

    it('should fallback to default title when AI fails', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Test message', timestamp: Date.now() }
      ]
      
      const mockAiService = {
        generateText: jest.fn().mockRejectedValue(new Error('AI error'))
      }
      
      const result = await useCase.execute(messages, mockAiService)
      expect(result).toBe('Test message')
    })

    it('should fallback to default title when AI returns empty', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Test message', timestamp: Date.now() }
      ]
      
      const mockAiService = {
        generateText: jest.fn().mockResolvedValue('')
      }
      
      const result = await useCase.execute(messages, mockAiService)
      expect(result).toBe('Test message')
    })

    it('should fallback to default title when AI returns too long', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Test message', timestamp: Date.now() }
      ]
      
      const mockAiService = {
        generateText: jest.fn().mockResolvedValue('A'.repeat(101))
      }
      
      const result = await useCase.execute(messages, mockAiService)
      expect(result).toBe('Test message')
    })

    it('should handle messages with multiple user messages', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'First message', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Response', timestamp: Date.now() },
        { id: '3', role: 'user', content: 'Second message', timestamp: Date.now() }
      ]
      
      const result = await useCase.execute(messages)
      expect(result).toBe('First message')
    })
  })
})
