import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'

export class DeleteChatSessionUseCase {
  constructor(private repository: IChatSessionRepository) {}

  async execute(chatId: string, userId: string): Promise<void> {
    await this.repository.delete(chatId, userId)
  }
}
