// Application Hook: useTranscription
"use client"

import { useState, useCallback } from 'react'
import { TranscribeAudioUseCase } from '@/src/core/use-cases/transcription/transcribe-audio.use-case'
import { TranscriptionService } from '@/src/infrastructure/ai/services/transcription.service'
import type { TranscriptionResponse } from '@/src/core/entities/ai.entity'

export function useTranscription(apiKey: string | null = null) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transcribe = useCallback(
    async (audioBlob: Blob): Promise<TranscriptionResponse | null> => {
      setIsLoading(true)
      setError(null)

      const transcriptionService = new TranscriptionService(apiKey)
      const transcribeAudioUseCase = new TranscribeAudioUseCase(transcriptionService)

      try {
        const result = await transcribeAudioUseCase.execute({
          audioBlob,
          model: 'whisper-1'
        })

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to transcribe audio'
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [apiKey]
  )

  return {
    transcribe,
    isLoading,
    error,
    setError
  }
}
