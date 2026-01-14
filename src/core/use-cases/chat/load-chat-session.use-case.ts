import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { ChatSessionEntity } from '@/src/core/entities/chat-session.entity'

export class LoadChatSessionUseCase {
  constructor(private repository: IChatSessionRepository) {}

  async execute(chatId: string, userId: string): Promise<ChatSessionEntity | null> {
    return await this.repository.getById(chatId, userId)
  }
}
