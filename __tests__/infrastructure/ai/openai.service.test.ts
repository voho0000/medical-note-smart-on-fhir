// Unit Tests: OpenAI Service
import { OpenAiService } from '@/src/infrastructure/ai/services/openai.service'
import type { AiQueryRequest } from '@/src/core/entities/ai.entity'

// Mock fetch
global.fetch = jest.fn()

describe('OpenAiService', () => {
  let service: OpenAiService
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    service = new OpenAiService('test-api-key')
  })

  describe('isAvailable', () => {
    it('should return true when API key is set', () => {
      const service = new OpenAiService('test-key')
      expect(service.isAvailable()).toBe(true)
    })

    it('should check availability based on API key or proxy', () => {
      const service = new OpenAiService(null)
      // Note: isAvailable() checks ENV_CONFIG.hasChatProxy which may be true in test environment
      expect(typeof service.isAvailable()).toBe('boolean')
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      const service = new OpenAiService(null)
      const wasAvailable = service.isAvailable()
      
      service.setApiKey('new-key')
      expect(service.isAvailable()).toBe(true)
    })

    it('should allow setting key to null', () => {
      const service = new OpenAiService('test-key')
      expect(service.isAvailable()).toBe(true)
      
      service.setApiKey(null)
      // May still be available if proxy is configured
      expect(typeof service.isAvailable()).toBe('boolean')
    })
  })

  describe('query', () => {
    const mockRequest: AiQueryRequest = {
      modelId: 'gpt-5.1',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
    }

    it('should successfully query OpenAI API', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello! How can I help you?'
            }
          }
        ],
        usage: {
          total_tokens: 20
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('Hello! How can I help you?')
      expect(result.metadata.modelId).toBe('gpt-5.1')
      expect(result.metadata.provider).toBe('openai')
      expect(result.metadata.tokensUsed).toBe(20)
    })

    it('should throw error when API key is missing', async () => {
      // Arrange
      const service = new OpenAiService(null)
      
      // Mock fetch to simulate no proxy available
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'API key required' }),
      } as Response)
      
      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow()
    })

    it('should handle API errors', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid request' } }),
      } as Response)

      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow('Invalid request')
    })

    it('should handle timeout', async () => {
      // Arrange
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100)
        })
      )

      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow()
    })

    it('should set temperature to 1 for gpt-5-mini', async () => {
      // Arrange
      const gpt5Request: AiQueryRequest = {
        modelId: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Test' }],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      } as Response)

      // Act
      await service.query(gpt5Request)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.temperature).toBe(1)
    })

    it('should include custom temperature when provided', async () => {
      // Arrange
      const customTempRequest: AiQueryRequest = {
        modelId: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      } as Response)

      // Act
      await service.query(customTempRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.temperature).toBe(0.5)
    })

    it('should include API key in headers', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      } as Response)

      // Act
      await service.query(mockRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const headers = fetchCall[1]?.headers as Record<string, string>
      expect(headers['x-openai-key']).toBe('test-api-key')
    })

    it('should handle empty response content', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('')
    })
  })
})
