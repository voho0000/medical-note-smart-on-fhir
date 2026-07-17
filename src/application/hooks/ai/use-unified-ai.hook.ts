/**
 * Unified AI Hook
 * Provides a consistent interface for AI operations across all features
 * Following Single Responsibility Principle
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { useAllApiKeys } from '@/src/application/stores/ai-config.store'
import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import { StreamOrchestrator } from '@/src/infrastructure/ai/streaming/stream-orchestrator'
import { getUserErrorMessage } from '@/src/core/errors'
import { DEFAULT_MODEL_ID } from '@/src/shared/constants/ai-models.constants'
import type { AiMessage } from '@/src/core/entities/ai.entity'
import { apiKeyForModel } from '@/src/shared/utils/model-access.utils'

interface UseUnifiedAiOptions {
  defaultModel?: string
  onSuccess?: (text: string) => void
  onError?: (error: string) => void
}

interface QueryOptions {
  modelId?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json'
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
  const { apiKey: openAiKey, geminiKey, claudeKey, openAiCompatible } = useAllApiKeys()
  // Callers with a model preference pass modelId explicitly (chat/insights/
  // summary/safety); the rest (e.g. IPS problem inference) land on the free
  // default. The former global picked-model no longer exists.
  const defaultModel = DEFAULT_MODEL_ID
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A Set, not a single ref: one hook instance can have several requests in
  // flight. stop() must abort every non-streaming query and stream owned by
  // this hook instance.
  const abortControllersRef = useRef<Set<AbortController>>(new Set())

  // Cache AI service instance to avoid recreating on every call
  const aiService = useMemo(
    () => new AiService(openAiKey, geminiKey, claudeKey, openAiCompatible),
    [openAiKey, geminiKey, claudeKey, openAiCompatible]
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
      const abortController = new AbortController()
      abortControllersRef.current.add(abortController)

      try {
        const result = await queryUseCase.execute({
          messages,
          modelId: queryOptions?.modelId || options.defaultModel || defaultModel,
          temperature: queryOptions?.temperature,
          maxTokens: queryOptions?.maxTokens,
          responseFormat: queryOptions?.responseFormat,
          signal: abortController.signal,
        })

        options.onSuccess?.(result.text)
        return result.text
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        const errorMessage = getUserErrorMessage(err)
        setError(errorMessage)
        options.onError?.(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
        abortControllersRef.current.delete(abortController)
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
      const abortController = new AbortController()
      abortControllersRef.current.add(abortController)

      const modelId = streamOptions?.modelId || options.defaultModel || defaultModel
      const apiKey = apiKeyForModel(
        modelId,
        { openAiKey, geminiKey, claudeKey },
        openAiCompatible,
      )

      let fullText = ''

      try {
        await streamOrchestrator.stream({
          messages,
          model: modelId,
          apiKey,
          openAiCompatible,
          signal: abortController.signal,
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
        abortControllersRef.current.delete(abortController)
      }
    },
    [streamOrchestrator, openAiKey, geminiKey, claudeKey, openAiCompatible, defaultModel, options]
  )

  /**
   * Stop AI work — aborts every in-flight query or stream started by this hook instance.
   */
  const stop = useCallback(() => {
    for (const controller of abortControllersRef.current) controller.abort()
    abortControllersRef.current.clear()
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
