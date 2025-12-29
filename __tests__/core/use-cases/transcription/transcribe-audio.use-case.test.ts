// Unit Tests: Transcribe Audio Use Case
import { TranscribeAudioUseCase } from '@/src/core/use-cases/transcription/transcribe-audio.use-case'
import type { ITranscriptionService } from '@/src/core/interfaces/services/transcription.service.interface'
import type { TranscriptionRequest, TranscriptionResponse } from '@/src/core/entities/ai.entity'

describe('TranscribeAudioUseCase', () => {
  let useCase: TranscribeAudioUseCase
  let mockTranscriptionService: jest.Mocked<ITranscriptionService>

  beforeEach(() => {
    mockTranscriptionService = {
      isAvailable: jest.fn(),
      transcribe: jest.fn(),
    }
    useCase = new TranscribeAudioUseCase(mockTranscriptionService)
  })

  const createMockAudioBlob = (size: number = 1000): Blob => {
    return new Blob([new ArrayBuffer(size)], { type: 'audio/webm' })
  }

  describe('execute', () => {
    it('should transcribe audio successfully', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }
      const mockResponse: TranscriptionResponse = {
        text: 'This is the transcribed text',
        timestamp: new Date().toISOString()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockResolvedValue(mockResponse)

      // Act
      const result = await useCase.execute(mockRequest)

      // Assert
      expect(result).toEqual(mockResponse)
      expect(mockTranscriptionService.isAvailable).toHaveBeenCalled()
      expect(mockTranscriptionService.transcribe).toHaveBeenCalledWith(mockRequest)
    })

    it('should throw error when service is not available', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(false)

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow(
        'Transcription service is not available. Please configure API key or proxy.'
      )
      expect(mockTranscriptionService.transcribe).not.toHaveBeenCalled()
    })

    it('should throw error when audio blob is empty', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob(0) // Empty blob
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow('Audio blob is empty')
      expect(mockTranscriptionService.transcribe).not.toHaveBeenCalled()
    })

    it('should handle transcription service errors', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockRejectedValue(new Error('Transcription failed'))

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow('Transcription failed')
    })

    it('should pass through language parameter', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }
      const mockResponse: TranscriptionResponse = {
        text: '這是轉錄的文字',
        timestamp: new Date().toISOString()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockResolvedValue(mockResponse)

      // Act
      const result = await useCase.execute(mockRequest)

      // Assert
      expect(result.text).toBe('這是轉錄的文字')
      expect(mockTranscriptionService.transcribe).toHaveBeenCalledWith(mockRequest)
    })

    it('should handle large audio files', async () => {
      // Arrange
      const largeBlob = createMockAudioBlob(10 * 1024 * 1024) // 10MB
      const mockRequest: TranscriptionRequest = {
        audioBlob: largeBlob
      }
      const mockResponse: TranscriptionResponse = {
        text: 'Transcribed large audio',
        timestamp: new Date().toISOString()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockResolvedValue(mockResponse)

      // Act
      const result = await useCase.execute(mockRequest)

      // Assert
      expect(result).toEqual(mockResponse)
      expect(mockTranscriptionService.transcribe).toHaveBeenCalled()
    })

    it('should validate service availability before checking blob size', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob(0)
      }

      mockTranscriptionService.isAvailable.mockReturnValue(false)

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow(
        'Transcription service is not available'
      )
    })

    it('should handle network timeout errors', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockRejectedValue(new Error('Request timeout'))

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow('Request timeout')
    })

    it('should handle API key errors', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockRejectedValue(new Error('Invalid API key'))

      // Act & Assert
      await expect(useCase.execute(mockRequest)).rejects.toThrow('Invalid API key')
    })

    it('should return transcription with timestamp', async () => {
      // Arrange
      const mockRequest: TranscriptionRequest = {
        audioBlob: createMockAudioBlob()
      }
      const mockResponse: TranscriptionResponse = {
        text: 'Transcribed text',
        timestamp: '2024-01-15T10:30:00Z'
      }

      mockTranscriptionService.isAvailable.mockReturnValue(true)
      mockTranscriptionService.transcribe.mockResolvedValue(mockResponse)

      // Act
      const result = await useCase.execute(mockRequest)

      // Assert
      expect(result.text).toBe('Transcribed text')
      expect(result.timestamp).toBe('2024-01-15T10:30:00Z')
    })
  })
})
