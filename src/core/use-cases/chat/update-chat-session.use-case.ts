import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { UpdateChatSessionDto } from '@/src/core/entities/chat-session.entity'

export class UpdateChatSessionUseCase {
  constructor(private repository: IChatSessionRepository) {}

  async execute(chatId: string, userId: string, dto: UpdateChatSessionDto): Promise<void> {
    await this.repository.update(chatId, userId, dto)
  }
}
