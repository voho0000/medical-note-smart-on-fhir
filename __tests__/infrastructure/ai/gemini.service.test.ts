// Unit Tests: Gemini Service
import { GeminiService } from '@/src/infrastructure/ai/services/gemini.service'
import type { AiQueryRequest } from '@/src/core/entities/ai.entity'

// Mock fetch
global.fetch = jest.fn()

describe('GeminiService', () => {
  let service: GeminiService
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    service = new GeminiService('test-api-key')
  })

  describe('isAvailable', () => {
    it('should return true when API key is set', () => {
      const service = new GeminiService('test-key')
      expect(service.isAvailable()).toBe(true)
    })

    it('should return false when API key is not set and no proxy', () => {
      const service = new GeminiService(null)
      expect(service.isAvailable()).toBe(false)
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      const service = new GeminiService(null)
      expect(service.isAvailable()).toBe(false)
      
      service.setApiKey('new-key')
      expect(service.isAvailable()).toBe(true)
    })
  })

  describe('query', () => {
    const mockRequest: AiQueryRequest = {
      modelId: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
    }

    it('should successfully query Gemini API', async () => {
      // Arrange
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Hello! How can I assist you?' }
              ]
            }
          }
        ],
        usageMetadata: {
          totalTokenCount: 25
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('Hello! How can I assist you?')
      expect(result.metadata.modelId).toBe('gemini-2.5-flash')
      expect(result.metadata.provider).toBe('gemini')
      expect(result.metadata.tokensUsed).toBe(25)
    })

    it('should throw error when API key is missing', async () => {
      // Arrange
      const service = new GeminiService(null)
      
      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow('Gemini API key is required')
    })

    it('should handle API errors', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as Response)

      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow('Invalid API key')
    })

    it('should include temperature in request', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      } as Response)

      // Act
      await service.query(mockRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.temperature).toBe(0.7)
    })

    it('should include API key in headers for direct API', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      } as Response)

      // Act
      await service.query(mockRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const headers = fetchCall[1]?.headers as Record<string, string>
      expect(headers['x-goog-api-key']).toBe('test-api-key')
    })

    it('should handle empty response content', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '' }] } }],
        }),
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('')
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
  })
})
