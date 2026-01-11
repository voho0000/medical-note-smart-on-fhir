/**
 * AI Provider Interface
 * Defines the contract for AI service providers (OpenAI, Gemini, etc.)
 * Following Dependency Inversion Principle
 */

import type { AiMessage, AiQueryResponse } from '@/src/core/entities/ai.entity'

/**
 * AI Provider Configuration
 */
export interface AiProviderConfig {
  apiKey: string | null
  baseUrl?: string
  timeout?: number
  maxRetries?: number
}

/**
 * Streaming Options
 */
export interface StreamingOptions {
  signal?: AbortSignal
  onChunk?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: Error) => void
}

/**
 * AI Provider Interface
 * All AI providers must implement this interface
 */
export interface IAiProvider {
  /**
   * Provider name (e.g., 'openai', 'gemini')
   */
  readonly name: string

  /**
   * Check if provider is configured and ready
   */
  isReady(): boolean

  /**
   * Query AI with messages (non-streaming)
   */
  query(
    messages: AiMessage[],
    modelId: string,
    options?: {
      temperature?: number
      maxTokens?: number
    }
  ): Promise<AiQueryResponse>

  /**
   * Stream AI response
   */
  stream(
    messages: AiMessage[],
    modelId: string,
    options: StreamingOptions
  ): Promise<string>

  /**
   * Validate model ID for this provider
   */
  supportsModel(modelId: string): boolean
}

/**
 * AI Provider Factory Interface
 */
export interface IAiProviderFactory {
  /**
   * Create provider instance
   */
  createProvider(config: AiProviderConfig): IAiProvider

  /**
   * Get supported model IDs
   */
  getSupportedModels(): string[]
}
