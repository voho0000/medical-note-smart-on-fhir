import type { 
  ChatSessionEntity, 
  ChatSessionMetadata,
  CreateChatSessionDto,
  UpdateChatSessionDto 
} from '@/src/core/entities/chat-session.entity'

export interface IChatSessionRepository {
  create(dto: CreateChatSessionDto): Promise<ChatSessionEntity>
  
  update(chatId: string, userId: string, dto: UpdateChatSessionDto): Promise<void>
  
  updateTitle(chatId: string, userId: string, title: string): Promise<void>
  
  getById(chatId: string, userId: string): Promise<ChatSessionEntity | null>
  
  listByPatient(
    userId: string, 
    patientId: string, 
    fhirServerUrl: string
  ): Promise<ChatSessionMetadata[]>
  
  listByUser(userId: string, limit?: number): Promise<ChatSessionMetadata[]>
  
  delete(chatId: string, userId: string): Promise<void>
  
  subscribe(
    userId: string,
    patientId: string,
    fhirServerUrl: string,
    callback: (sessions: ChatSessionMetadata[]) => void
  ): () => void
}
