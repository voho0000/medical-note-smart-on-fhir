/**
 * AI Provider Interface
 * Low-level interface for AI provider implementations (OpenAI, Gemini, etc.)
 */

import type { AiMessage } from '@/src/core/entities/ai.entity'

/**
 * Streaming Options
 */
export interface StreamingOptions {
  temperature?: number
  maxTokens?: number
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * AI Provider Configuration
 */
export interface AiProviderConfig {
  apiKey: string
  timeout?: number
}

/**
 * AI Provider Interface
 * Each AI provider (OpenAI, Gemini) implements this interface
 */
export interface IAiProvider {
  readonly name: string
  
  /**
   * Query AI (non-streaming)
   */
  query(
    messages: AiMessage[],
    modelId: string,
    options?: {
      temperature?: number
      maxTokens?: number
    }
  ): Promise<string>
  
  /**
   * Stream AI response
   */
  stream(
    messages: AiMessage[],
    modelId: string,
    options?: StreamingOptions
  ): Promise<string>
  
  /**
   * Check if provider supports a model
   */
  supportsModel(modelId: string): boolean
}
