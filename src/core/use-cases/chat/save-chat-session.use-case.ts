import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { CreateChatSessionDto, ChatSessionEntity } from '@/src/core/entities/chat-session.entity'

export class SaveChatSessionUseCase {
  constructor(private repository: IChatSessionRepository) {}

  async execute(dto: CreateChatSessionDto): Promise<ChatSessionEntity> {
    return await this.repository.create(dto)
  }
}
