import type { ChatMessage } from '@/src/application/stores/chat.store'

export interface ChatSessionEntity {
  id: string
  userId: string
  fhirServerUrl: string
  patientId: string
  title: string
  summary?: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  messageCount: number
  tags?: string[]
}

export interface ChatSessionMetadata {
  id: string
  userId: string
  fhirServerUrl: string
  patientId: string
  title: string
  summary?: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  tags?: string[]
}

export interface CreateChatSessionDto {
  userId: string
  fhirServerUrl: string
  patientId: string
  messages: ChatMessage[]
  title?: string
  locale?: string // User's language preference for title generation
}

export interface UpdateChatSessionDto {
  messages?: ChatMessage[]
  title?: string
  summary?: string
  tags?: string[]
}
