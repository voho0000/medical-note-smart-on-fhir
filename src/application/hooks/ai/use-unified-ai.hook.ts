/**
 * Unified AI Hook
 * Provides a consistent interface for AI operations across all features
 * Following Single Responsibility Principle
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import { StreamOrchestrator } from '@/src/infrastructure/ai/streaming/stream-orchestrator'
import { getUserErrorMessage } from '@/src/core/errors'
import {
  DEFAULT_MODEL_ID,
  isCustomOpenAiModelId,
} from '@/src/shared/constants/ai-models.constants'
import type { AiMessage } from '@/src/core/entities/ai.entity'
import { apiKeyForModel } from '@/src/shared/utils/model-access.utils'
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

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

interface ActiveAiRequest {
  operationKey?: string
  modelId: string
  /** Object identity is intentional: every saved edit creates a replacement
   * profile, so an in-flight request can be aborted without retaining or
   * serialising a second copy of its API key. */
  openAiCompatible: OpenAiCompatibleProfile | null
}

/**
 * Unified AI Hook
 * Consolidates AI query and streaming functionality
 */
export function useUnifiedAi(options: UseUnifiedAiOptions = {}) {
  // Callers with a model preference pass modelId explicitly (chat/insights/
  // summary/safety); the rest (e.g. IPS problem inference) land on the free
  // default. The former global picked-model no longer exists.
  const defaultModel = DEFAULT_MODEL_ID
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A keyed Map, not a single ref: one hook instance can have requests from
  // several model/input slots in flight. stop(key) aborts only that owner;
  // stop() without a key remains the global teardown used on Bundle changes.
  const abortControllersRef = useRef<Map<AbortController, ActiveAiRequest>>(new Map())

  // Cache stream orchestrator instance
  const streamOrchestrator = useMemo(
    () => new StreamOrchestrator(),
    []
  )

  // A saved edit replaces the profile object in the store. Abort every request
  // that still owns the previous object, including requests kept alive while a
  // different Settings screen is open. Deleted and disabled profiles also fail
  // this check. This prevents a stale endpoint/key snapshot from continuing to
  // receive clinical data after the user changes that connection.
  useEffect(() => {
    const abortControllers = abortControllersRef.current
    const unsubscribe = useAiConfigStore.subscribe((state, previousState) => {
      if (state.openAiCompatibleProfiles === previousState.openAiCompatibleProfiles) return
      for (const [controller, request] of abortControllers) {
        if (!isCustomOpenAiModelId(request.modelId)) continue
        const liveProfile = resolveOpenAiCompatibleProfile(
          request.modelId,
          state.openAiCompatibleProfiles,
        )
        if (
          liveProfile !== request.openAiCompatible ||
          !isOpenAiCompatibleRuntimeReady(liveProfile)
        ) {
          controller.abort()
        }
      }
    })

    return () => {
      unsubscribe()
      for (const controller of abortControllers.keys()) controller.abort()
      abortControllers.clear()
    }
  }, [])

  /**
   * Query AI (non-streaming)
   */
  const query = useCallback(
    async (messages: AiMessage[], queryOptions?: QueryOptions): Promise<string> => {
      setIsLoading(true)
      setError(null)
      const modelId = queryOptions?.modelId || options.defaultModel || defaultModel
      const liveConfig = useAiConfigStore.getState()
      const openAiCompatible = resolveOpenAiCompatibleProfile(
        modelId,
        liveConfig.openAiCompatibleProfiles,
      )
      const abortController = new AbortController()
      abortControllersRef.current.set(abortController, {
        operationKey: queryOptions?.operationKey,
        modelId,
        openAiCompatible,
      })

      try {
        const queryUseCase = new QueryAiUseCase(new AiService(
          liveConfig.apiKey,
          liveConfig.geminiKey,
          liveConfig.claudeKey,
          liveConfig.openAiCompatibleProfiles,
        ))
        const result = await queryUseCase.execute({
          messages,
          modelId,
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
    [defaultModel, options]
  )

  /**
   * Stream AI response
   */
  const stream = useCallback(
    async (messages: AiMessage[], streamOptions?: StreamOptions): Promise<string> => {
      setIsLoading(true)
      setError(null)
      const modelId = streamOptions?.modelId || options.defaultModel || defaultModel
      const liveConfig = useAiConfigStore.getState()
      const openAiCompatible = resolveOpenAiCompatibleProfile(
        modelId,
        liveConfig.openAiCompatibleProfiles,
      )
      const abortController = new AbortController()
      abortControllersRef.current.set(abortController, {
        operationKey: streamOptions?.operationKey,
        modelId,
        openAiCompatible,
      })
      const apiKey = apiKeyForModel(
        modelId,
        {
          openAiKey: liveConfig.apiKey,
          geminiKey: liveConfig.geminiKey,
          claudeKey: liveConfig.claudeKey,
        },
        openAiCompatible,
      )

      let fullText = ''

      try {
        // A custom model id must resolve to the exact enabled profile at the
        // instant the request starts. Never let the adapter infer a different
        // endpoint or cloud fallback from a deleted/stale selection.
        if (
          isCustomOpenAiModelId(modelId) &&
          !isOpenAiCompatibleRuntimeReady(openAiCompatible)
        ) {
          throw new Error('OpenAI-compatible endpoint is not configured')
        }
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
    [streamOrchestrator, defaultModel, options]
  )

  /** Stop one owned operation, or every in-flight request when no key is given. */
  const stop = useCallback((operationKey?: string) => {
    let stoppedAny = false
    for (const [controller, request] of abortControllersRef.current) {
      if (operationKey !== undefined && request.operationKey !== operationKey) continue
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
