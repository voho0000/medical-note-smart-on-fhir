import type { AiMessage, ChatMessage, AiQueryRequest, AiQueryResponse, TranscriptionRequest, TranscriptionResponse } from '@/src/core/entities/ai.entity'

describe('ai.entity', () => {
  describe('AiMessage', () => {
    it('should have correct structure', () => {
      const message: AiMessage = {
        role: 'user',
        content: 'Hello'
      }
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello')
    })

    it('should support all roles', () => {
      const roles: Array<'user' | 'assistant' | 'system'> = ['user', 'assistant', 'system']
      roles.forEach(role => {
        const message: AiMessage = { role, content: 'test' }
        expect(message.role).toBe(role)
      })
    })
  })

  describe('ChatMessage', () => {
    it('should extend AiMessage with id and timestamp', () => {
      const message: ChatMessage = {
        id: '123',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      }
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeDefined()
    })
  })

  describe('AiQueryRequest', () => {
    it('should have required fields', () => {
      const request: AiQueryRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 'gpt-4'
      }
      expect(request.messages).toBeDefined()
      expect(request.modelId).toBeDefined()
    })

    it('should support optional fields', () => {
      const request: AiQueryRequest = {
        messages: [],
        modelId: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000
      }
      expect(request.temperature).toBe(0.7)
      expect(request.maxTokens).toBe(1000)
    })
  })

  describe('AiQueryResponse', () => {
    it('should have correct structure', () => {
      const response: AiQueryResponse = {
        text: 'Response text',
        metadata: {
          modelId: 'gpt-4',
          provider: 'openai',
          tokensUsed: 100
        }
      }
      expect(response.text).toBeDefined()
      expect(response.metadata.modelId).toBeDefined()
      expect(response.metadata.provider).toBeDefined()
    })
  })

  describe('TranscriptionRequest', () => {
    it('should have audioBlob', () => {
      const blob = new Blob(['test'], { type: 'audio/wav' })
      const request: TranscriptionRequest = {
        audioBlob: blob
      }
      expect(request.audioBlob).toBeDefined()
    })

    it('should support optional model', () => {
      const blob = new Blob(['test'], { type: 'audio/wav' })
      const request: TranscriptionRequest = {
        audioBlob: blob,
        model: 'whisper-1'
      }
      expect(request.model).toBe('whisper-1')
    })
  })

  describe('TranscriptionResponse', () => {
    it('should have text and timestamp', () => {
      const response: TranscriptionResponse = {
        text: 'Transcribed text',
        timestamp: new Date().toISOString()
      }
      expect(response.text).toBeDefined()
      expect(response.timestamp).toBeDefined()
    })
  })
})
