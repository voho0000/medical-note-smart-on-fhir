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
  /** Optional owner identity for cancelling one structured generation slot
   * without aborting background work from another patient/input scope. */
  operationKey?: string
}

interface StreamOptions extends QueryOptions {
  onChunk?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  /** Structured generators must not parse or persist a partial response after
   * an explicit user stop. Other callers keep the historical partial-text
   * behaviour by leaving this false. */
  throwOnAbort?: boolean
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
  // A keyed Map, not a single ref: one hook instance can have requests from
  // several model/input slots in flight. stop(key) aborts only that owner;
  // stop() without a key remains the global teardown used on Bundle changes.
  const abortControllersRef = useRef<Map<AbortController, string | undefined>>(new Map())

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
      abortControllersRef.current.set(abortController, queryOptions?.operationKey)

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
        abortControllersRef.current.delete(abortController)
        setIsLoading(abortControllersRef.current.size > 0)
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
      abortControllersRef.current.set(abortController, streamOptions?.operationKey)

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

        // Some streaming adapters resolve normally after forwarding an abort
        // instead of rejecting. Structured callers still need a hard stop so
        // they neither parse buffered text nor launch their parse-retry pass.
        if (abortController.signal.aborted && streamOptions?.throwOnAbort) {
          const abortError = new Error('The operation was aborted')
          abortError.name = 'AbortError'
          throw abortError
        }

        streamOptions?.onComplete?.(fullText)
        options.onSuccess?.(fullText)
        return fullText
      } catch (err) {
        if (abortController.signal.aborted) {
          if (streamOptions?.throwOnAbort) {
            if (err instanceof Error && err.name === 'AbortError') throw err
            const abortError = new Error('The operation was aborted')
            abortError.name = 'AbortError'
            throw abortError
          }
          return fullText
        }
        if (err instanceof Error && err.name === 'AbortError') {
          if (streamOptions?.throwOnAbort) throw err
          return fullText
        }

        const errorMessage = getUserErrorMessage(err)
        setError(errorMessage)
        options.onError?.(errorMessage)
        throw err
      } finally {
        abortControllersRef.current.delete(abortController)
        setIsLoading(abortControllersRef.current.size > 0)
      }
    },
    [streamOrchestrator, openAiKey, geminiKey, claudeKey, openAiCompatible, defaultModel, options]
  )

  /** Stop one owned operation, or every in-flight request when no key is given. */
  const stop = useCallback((operationKey?: string) => {
    let stoppedAny = false
    for (const [controller, ownerKey] of abortControllersRef.current) {
      if (operationKey !== undefined && ownerKey !== operationKey) continue
      controller.abort()
      abortControllersRef.current.delete(controller)
      stoppedAny = true
    }
    if (stoppedAny) setIsLoading(abortControllersRef.current.size > 0)
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
