import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

export class GetChatHistoryUseCase {
  constructor(private repository: IChatSessionRepository) {}

  async execute(
    userId: string,
    patientId: string,
    fhirServerUrl: string
  ): Promise<ChatSessionMetadata[]> {
    return await this.repository.listByPatient(userId, patientId, fhirServerUrl)
  }
}
