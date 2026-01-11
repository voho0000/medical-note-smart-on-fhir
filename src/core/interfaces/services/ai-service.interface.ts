/**
 * Unified AI Service Interface
 * High-level interface for AI operations
 * Following Interface Segregation Principle
 */

import type { AiMessage, AiQueryResponse } from '@/src/core/entities/ai.entity'

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
 * AI Service Configuration
 */
export interface AiServiceConfig {
  openAiApiKey?: string | null
  geminiApiKey?: string | null
  defaultModel?: string
  timeout?: number
}

/**
 * Main AI Service Interface
 * Provides unified access to AI operations
 */
export interface IAiService {
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
  ): Promise<AiQueryResponse>

  /**
   * Stream AI response
   */
  stream(
    messages: AiMessage[],
    modelId: string,
    options?: StreamingOptions
  ): Promise<string>

  /**
   * Check if a model is available
   */
  isModelAvailable(modelId: string): boolean

  /**
   * Get available models
   */
  getAvailableModels(): string[]
}
