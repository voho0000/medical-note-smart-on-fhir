import type { AiModelExecution } from './ai-model-execution.entity'

// Core Domain Entities: AI & LLM

export type AiProvider = 'openai' | 'gemini' | 'claude' | 'custom'

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
}

export interface AiQueryRequest {
  messages: AiMessage[]
  modelId: string
  temperature?: number
  maxTokens?: number
  /** OpenAI-compatible reasoning control (supported by gpt-oss and some
   * compatible reasoning servers). Omitted unless a caller opts in. */
  reasoningEffort?: 'low' | 'medium' | 'high'
  /** Optional caller cancellation for non-streaming requests. */
  signal?: AbortSignal
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
    modelExecution?: AiModelExecution
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
