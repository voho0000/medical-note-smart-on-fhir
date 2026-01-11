/**
 * Unified AI Hook
 * Provides a consistent interface for AI operations across all features
 * Following Single Responsibility Principle
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { useAllApiKeys, useModel } from '@/src/stores/ai-config.store'
import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import { StreamOrchestrator } from '@/src/infrastructure/ai/streaming/stream-orchestrator'
import { getUserErrorMessage } from '@/src/core/errors'
import type { AiMessage } from '@/src/core/entities/ai.entity'

interface UseUnifiedAiOptions {
  defaultModel?: string
  onSuccess?: (text: string) => void
  onError?: (error: string) => void
}

interface QueryOptions {
  modelId?: string
  temperature?: number
  maxTokens?: number
}

interface StreamOptions extends QueryOptions {
  onChunk?: (chunk: string) => void
  onComplete?: (fullText: string) => void
}

/**
 * Unified AI Hook
 * Consolidates AI query and streaming functionality
 */
export function useUnifiedAi(options: UseUnifiedAiOptions = {}) {
  const { apiKey: openAiKey, geminiKey } = useAllApiKeys()
  const defaultModel = useModel()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cache AI service instance to avoid recreating on every call
  const aiService = useMemo(
    () => new AiService(openAiKey, geminiKey),
    [openAiKey, geminiKey]
  )

  // Cache use case instance
  const queryUseCase = useMemo(
    () => new QueryAiUseCase(aiService),
    [aiService]
  )

  // Cache stream orchestrator instance
  const streamOrchestrator = useMemo(
    () => new StreamOrchestrator(),
    []
  )

  /**
   * Query AI (non-streaming)
   */
  const query = useCallback(
    async (messages: AiMessage[], queryOptions?: QueryOptions): Promise<string> => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await queryUseCase.execute({
          messages,
          modelId: queryOptions?.modelId || options.defaultModel || defaultModel,
          temperature: queryOptions?.temperature,
          maxTokens: queryOptions?.maxTokens,
        })

        options.onSuccess?.(result.text)
        return result.text
      } catch (err) {
        const errorMessage = getUserErrorMessage(err)
        setError(errorMessage)
        options.onError?.(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [queryUseCase, defaultModel, options]
  )

  /**
   * Stream AI response
   */
  const stream = useCallback(
    async (messages: AiMessage[], streamOptions?: StreamOptions): Promise<string> => {
      setIsLoading(true)
      setError(null)
      abortControllerRef.current = new AbortController()

      const modelId = streamOptions?.modelId || options.defaultModel || defaultModel
      const apiKey = modelId.startsWith('gemini') ? geminiKey : openAiKey

      let fullText = ''

      try {
        await streamOrchestrator.stream({
          messages,
          model: modelId,
          apiKey,
          signal: abortControllerRef.current.signal,
          onChunk: (chunk: string) => {
            fullText = chunk
            streamOptions?.onChunk?.(chunk)
          },
        })

        streamOptions?.onComplete?.(fullText)
        options.onSuccess?.(fullText)
        return fullText
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return fullText
        }

        const errorMessage = getUserErrorMessage(err)
        setError(errorMessage)
        options.onError?.(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [streamOrchestrator, openAiKey, geminiKey, defaultModel, options]
  )

  /**
   * Stop streaming
   */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    query,
    stream,
    stop,
    isLoading,
    error,
    clearError,
  }
}
