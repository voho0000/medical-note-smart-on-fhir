// Application Hook: useAiStreaming - Streaming AI responses
"use client"

import { useState, useCallback, useRef } from 'react'
import { StreamOrchestrator } from '@/src/infrastructure/ai/streaming/stream-orchestrator'

interface UseAiStreamingOptions {
  onChunk?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: Error) => void
}

export function useAiStreaming(
  openAiApiKey: string | null = null,
  geminiApiKey: string | null = null,
  options: UseAiStreamingOptions = {}
) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const orchestratorRef = useRef(new StreamOrchestrator())

  const streamAi = useCallback(
    async (messages: Array<{ role: string; content: string }>, modelId: string): Promise<string> => {
      setIsStreaming(true)
      setError(null)
      setStreamedText('')
      abortControllerRef.current = new AbortController()

      let accumulatedText = ''

      try {
        const apiKey = modelId.startsWith('gemini') ? geminiApiKey : openAiApiKey

        await orchestratorRef.current.stream({
          messages,
          model: modelId,
          apiKey,
          signal: abortControllerRef.current.signal,
          onChunk: (chunk: string) => {
            accumulatedText = chunk
            setStreamedText(chunk)
            options.onChunk?.(chunk)
          },
        })

        options.onComplete?.(accumulatedText)
        return accumulatedText
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return accumulatedText
        }
        
        const error = err instanceof Error ? err : new Error('Unknown error occurred')
        setError(error)
        options.onError?.(error)
        throw error
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [openAiApiKey, geminiApiKey, options]
  )

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
  }, [])

  return {
    streamAi,
    stopStreaming,
    streamedText,
    isStreaming,
    error,
  }
}
