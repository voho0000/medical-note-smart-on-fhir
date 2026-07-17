import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type {
  ChatSessionEntity,
  ChatSessionMetadata,
  CreateChatSessionDto,
  UpdateChatSessionDto,
} from '@/src/core/entities/chat-session.entity'

class OnPremChatSessionRepository implements IChatSessionRepository {
  async create(dto: CreateChatSessionDto): Promise<ChatSessionEntity> {
    const now = new Date()
    return {
      id: globalThis.crypto?.randomUUID?.() ?? `local-${now.getTime()}`,
      userId: dto.userId,
      fhirServerUrl: dto.fhirServerUrl,
      patientId: dto.patientId,
      title: dto.title ?? 'Local conversation',
      messages: dto.messages,
      createdAt: now,
      updatedAt: now,
      messageCount: dto.messages.length,
    }
  }

  async update(
    _chatId: string,
    _userId: string,
    _dto: UpdateChatSessionDto,
  ): Promise<void> {}

  async updateTitle(_chatId: string, _userId: string, _title: string): Promise<void> {}

  async getById(_chatId: string, _userId: string): Promise<ChatSessionEntity | null> {
    return null
  }

  async listByPatient(
    _userId: string,
    _patientId: string,
    _fhirServerUrl: string,
  ): Promise<ChatSessionMetadata[]> {
    return []
  }

  async listByUser(_userId: string, _limit?: number): Promise<ChatSessionMetadata[]> {
    return []
  }

  async delete(_chatId: string, _userId: string): Promise<void> {}

  subscribe(
    _userId: string,
    _patientId: string,
    _fhirServerUrl: string,
    callback: (sessions: ChatSessionMetadata[]) => void,
  ): () => void {
    callback([])
    return () => {}
  }
}

const repository = new OnPremChatSessionRepository()

export function getChatSessionRepository(): IChatSessionRepository {
  return repository
}
