import { UpdateChatSessionUseCase } from '@/src/core/use-cases/chat/update-chat-session.use-case'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { UpdateChatSessionDto } from '@/src/core/entities/chat-session.entity'

describe('UpdateChatSessionUseCase', () => {
  let useCase: UpdateChatSessionUseCase
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

    useCase = new UpdateChatSessionUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should update chat session title', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'
      const dto: UpdateChatSessionDto = {
        title: 'Updated Title'
      }

      mockRepository.update.mockResolvedValue(undefined)

      await useCase.execute(chatId, userId, dto)

      expect(mockRepository.update).toHaveBeenCalledWith(chatId, userId, dto)
    })

    it('should update chat session messages', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'
      const dto: UpdateChatSessionDto = {
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }
        ]
      }

      mockRepository.update.mockResolvedValue(undefined)

      await useCase.execute(chatId, userId, dto)

      expect(mockRepository.update).toHaveBeenCalledWith(chatId, userId, dto)
    })

    it('should update multiple fields', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'
      const dto: UpdateChatSessionDto = {
        title: 'Updated Title',
        summary: 'Updated Summary',
        tags: ['tag1', 'tag2']
      }

      mockRepository.update.mockResolvedValue(undefined)

      await useCase.execute(chatId, userId, dto)

      expect(mockRepository.update).toHaveBeenCalledWith(chatId, userId, dto)
    })

    it('should propagate repository errors', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'
      const dto: UpdateChatSessionDto = { title: 'New Title' }

      mockRepository.update.mockRejectedValue(new Error('Database error'))

      await expect(useCase.execute(chatId, userId, dto)).rejects.toThrow('Database error')
    })
  })
})
