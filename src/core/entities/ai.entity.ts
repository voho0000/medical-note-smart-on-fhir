// Core Domain Entities: AI & LLM

export type AiProvider = 'openai' | 'gemini'

export type AiMessageRole = 'user' | 'assistant' | 'system'

export interface AiMessage {
  role: AiMessageRole
  content: string
}

export interface ChatMessage extends AiMessage {
  id: string
  timestamp: number
}

export interface AiModelDefinition {
  id: string
  label: string
  description: string
  provider: AiProvider
  requiresUserKey?: boolean
}

export interface AiQueryRequest {
  messages: AiMessage[]
  modelId: string
  temperature?: number
  maxTokens?: number
}

export interface AiQueryResponse {
  text: string
  metadata: {
    modelId: string
    provider: AiProvider
    tokensUsed?: number
  }
}

export interface TranscriptionRequest {
  audioBlob: Blob
  model?: string
}

export interface TranscriptionResponse {
  text: string
  timestamp: string
}
