import { GetChatHistoryUseCase } from '@/src/core/use-cases/chat/get-chat-history.use-case'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

describe('GetChatHistoryUseCase', () => {
  let useCase: GetChatHistoryUseCase
  let mockRepository: jest.Mocked<IChatSessionRepository>

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      updateTitle: jest.fn(),
      delete: jest.fn(),
      listByPatient: jest.fn(),
      listByUser: jest.fn(),
      subscribe: jest.fn(),
    } as jest.Mocked<IChatSessionRepository>

    useCase = new GetChatHistoryUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should get chat history for a patient', async () => {
      const userId = 'user-1'
      const patientId = 'patient-1'
      const fhirServerUrl = 'https://fhir.example.com'
      
      const expectedHistory: ChatSessionMetadata[] = [
        {
          id: 'session-1',
          userId,
          fhirServerUrl,
          patientId,
          title: 'Session 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 5
        },
        {
          id: 'session-2',
          userId,
          fhirServerUrl,
          patientId,
          title: 'Session 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 3
        }
      ]

      mockRepository.listByPatient.mockResolvedValue(expectedHistory)

      const result = await useCase.execute(userId, patientId, fhirServerUrl)

      expect(mockRepository.listByPatient).toHaveBeenCalledWith(userId, patientId, fhirServerUrl)
      expect(result).toEqual(expectedHistory)
      expect(result).toHaveLength(2)
    })

    it('should return empty array for patient with no history', async () => {
      const userId = 'user-1'
      const patientId = 'patient-1'
      const fhirServerUrl = 'https://fhir.example.com'

      mockRepository.listByPatient.mockResolvedValue([])

      const result = await useCase.execute(userId, patientId, fhirServerUrl)

      expect(result).toEqual([])
    })

    it('should propagate repository errors', async () => {
      const userId = 'user-1'
      const patientId = 'patient-1'
      const fhirServerUrl = 'https://fhir.example.com'

      mockRepository.listByPatient.mockRejectedValue(new Error('Database error'))

      await expect(useCase.execute(userId, patientId, fhirServerUrl)).rejects.toThrow('Database error')
    })
  })
})
