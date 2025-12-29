// Application Hook: useAiQuery (renamed from useGptQuery)
"use client"

import { useState, useCallback } from 'react'
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import type { AiMessage, AiQueryResponse } from '@/src/core/entities/ai.entity'

interface UseAiQueryOptions {
  defaultModel?: string
  timeout?: number
  onResponse?: (response: string, metadata: AiQueryResponse['metadata']) => void
  onError?: (error: Error) => void
}

export function useAiQuery(
  openAiApiKey: string | null = null,
  geminiApiKey: string | null = null,
  options: UseAiQueryOptions = {}
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [response, setResponse] = useState('')
  const [progress, setProgress] = useState(0)
  const [lastMetadata, setLastMetadata] = useState<AiQueryResponse['metadata'] | null>(null)

  const queryAi = useCallback(
    async (messages: AiMessage[], modelId: string): Promise<AiQueryResponse> => {
      setIsLoading(true)
      setError(null)
      setResponse('')
      setProgress(0)
      setLastMetadata(null)

      const aiService = new AiService(openAiApiKey, geminiApiKey)
      const queryAiUseCase = new QueryAiUseCase(aiService)

      try {
        setProgress(10)

        const result = await queryAiUseCase.execute({
          messages,
          modelId,
          temperature: modelId === 'gpt-5-mini' ? 1 : undefined
        })

        setProgress(70)
        setResponse(result.text)
        setLastMetadata(result.metadata)
        options.onResponse?.(result.text, result.metadata)

        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error occurred')
        setError(error)
        options.onError?.(error)
        return { text: '', metadata: { modelId, provider: 'openai' } }
      } finally {
        setIsLoading(false)
        setTimeout(() => setProgress(0), 500)
      }
    },
    [openAiApiKey, geminiApiKey, options]
  )

  return {
    queryAi,
    response,
    isLoading,
    error,
    progress,
    lastMetadata
  }
}
