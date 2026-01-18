import { LoadChatSessionUseCase } from '@/src/core/use-cases/chat/load-chat-session.use-case'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { ChatSessionEntity } from '@/src/core/entities/chat-session.entity'

describe('LoadChatSessionUseCase', () => {
  let useCase: LoadChatSessionUseCase
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

    useCase = new LoadChatSessionUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should load an existing chat session', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'

      const expectedSession: ChatSessionEntity = {
        id: chatId,
        userId,
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'Test Session',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0
      }

      mockRepository.getById.mockResolvedValue(expectedSession)

      const result = await useCase.execute(chatId, userId)

      expect(mockRepository.getById).toHaveBeenCalledWith(chatId, userId)
      expect(result).toEqual(expectedSession)
    })

    it('should return null for non-existent session', async () => {
      const chatId = 'non-existent'
      const userId = 'user-1'

      mockRepository.getById.mockResolvedValue(null)

      const result = await useCase.execute(chatId, userId)

      expect(result).toBeNull()
    })

    it('should load session with messages', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'

      const expectedSession: ChatSessionEntity = {
        id: chatId,
        userId,
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'Test Session',
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
          { id: '2', role: 'assistant', content: 'Hi', timestamp: Date.now() }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 2
      }

      mockRepository.getById.mockResolvedValue(expectedSession)

      const result = await useCase.execute(chatId, userId)

      expect(result?.messages).toHaveLength(2)
    })

    it('should propagate repository errors', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'

      mockRepository.getById.mockRejectedValue(new Error('Database error'))

      await expect(useCase.execute(chatId, userId)).rejects.toThrow('Database error')
    })
  })
})
