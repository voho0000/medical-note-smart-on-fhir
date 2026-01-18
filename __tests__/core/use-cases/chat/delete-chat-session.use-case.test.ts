import { DeleteChatSessionUseCase } from '@/src/core/use-cases/chat/delete-chat-session.use-case'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'

describe('DeleteChatSessionUseCase', () => {
  let useCase: DeleteChatSessionUseCase
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

    useCase = new DeleteChatSessionUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should delete a chat session', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'

      mockRepository.delete.mockResolvedValue(undefined)

      await useCase.execute(chatId, userId)

      expect(mockRepository.delete).toHaveBeenCalledWith(chatId, userId)
    })

    it('should handle deletion of non-existent session', async () => {
      const chatId = 'non-existent'
      const userId = 'user-1'

      mockRepository.delete.mockResolvedValue(undefined)

      await expect(useCase.execute(chatId, userId)).resolves.not.toThrow()
    })

    it('should propagate repository errors', async () => {
      const chatId = 'session-1'
      const userId = 'user-1'

      mockRepository.delete.mockRejectedValue(new Error('Database error'))

      await expect(useCase.execute(chatId, userId)).rejects.toThrow('Database error')
    })
  })
})
