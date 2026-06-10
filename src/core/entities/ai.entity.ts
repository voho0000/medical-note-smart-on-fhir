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
  provider: AiProvider
  requiresUserKey?: boolean
}

export interface AiQueryRequest {
  messages: AiMessage[]
  modelId: string
  temperature?: number
  maxTokens?: number
  /**
   * Phase 2.2 — ask the model to return a strict JSON object.
   * Best-effort: maps to OpenAI `response_format: {type:'json_object'}` and
   * Gemini `generationConfig.responseMimeType: 'application/json'`. Proxies may
   * drop the flag, so callers must still defensively parse the returned text.
   */
  responseFormat?: 'json'
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
