import { SaveChatSessionUseCase } from '@/src/core/use-cases/chat/save-chat-session.use-case'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { CreateChatSessionDto, ChatSessionEntity } from '@/src/core/entities/chat-session.entity'

describe('SaveChatSessionUseCase', () => {
  let useCase: SaveChatSessionUseCase
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

    useCase = new SaveChatSessionUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should save a new chat session', async () => {
      const dto: CreateChatSessionDto = {
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        messages: [],
        title: 'Test Session'
      }

      const expectedSession: ChatSessionEntity = {
        id: 'session-1',
        userId: dto.userId,
        fhirServerUrl: dto.fhirServerUrl,
        patientId: dto.patientId,
        messages: dto.messages,
        title: dto.title || 'New Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0
      }

      mockRepository.create.mockResolvedValue(expectedSession)

      const result = await useCase.execute(dto)

      expect(mockRepository.create).toHaveBeenCalledWith(dto)
      expect(result).toEqual(expectedSession)
    })

    it('should handle session with messages', async () => {
      const dto: CreateChatSessionDto = {
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }
        ]
      }

      const expectedSession: ChatSessionEntity = {
        id: 'session-1',
        ...dto,
        title: 'New Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 1
      }

      mockRepository.create.mockResolvedValue(expectedSession)

      const result = await useCase.execute(dto)

      expect(result.messageCount).toBe(1)
    })

    it('should propagate repository errors', async () => {
      const dto: CreateChatSessionDto = {
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        messages: []
      }

      mockRepository.create.mockRejectedValue(new Error('Database error'))

      await expect(useCase.execute(dto)).rejects.toThrow('Database error')
    })
  })
})
