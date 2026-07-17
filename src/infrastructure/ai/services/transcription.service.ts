// Transcription Service Implementation (Whisper)
import type { ITranscriptionService } from '@/src/core/interfaces/services/transcription.service.interface'
import type { TranscriptionRequest, TranscriptionResponse } from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getProxyAuthHeaders } from '@/src/infrastructure/ai/utils/proxy-auth'
import {
  assertCloudCapabilityAllowed,
  DEPLOYMENT_CONFIG,
} from '@/src/shared/config/deployment-profile.config'
import { CLOUD_AI_ENDPOINTS } from '@/src/shared/config/cloud-ai-endpoints.config'

export class TranscriptionService implements ITranscriptionService {
  constructor(private apiKey: string | null = null) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return DEPLOYMENT_CONFIG.allowsCloudAi && Boolean(this.apiKey || ENV_CONFIG.hasWhisperProxy)
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    assertCloudCapabilityAllowed('Cloud transcription')
    const useProxy = !this.apiKey && ENV_CONFIG.hasWhisperProxy

    if (!this.apiKey && !useProxy) {
      throw new Error('OpenAI API key or Whisper proxy is required for transcription')
    }

    const formData = new FormData()
    formData.append('file', request.audioBlob, 'audio.webm')
    formData.append('model', request.model || 'whisper-1')

    const targetUrl = useProxy
      ? ENV_CONFIG.whisperProxyUrl
      : CLOUD_AI_ENDPOINTS.openAiTranscriptions
    const headers: Record<string, string> = {}

    if (useProxy) {
      if (ENV_CONFIG.proxyClientKey) {
        headers['x-proxy-key'] = ENV_CONFIG.proxyClientKey
      }
      Object.assign(headers, await getProxyAuthHeaders())
    } else if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Transcription API request failed with status ${response.status}`)
      }

      const result = await response.json()
      const text =
        result?.transcript?.trim() ||
        result?.text?.trim() ||
        result?.openAiResponse?.text?.trim() ||
        ''

      if (!text) {
        throw new Error('No transcription returned')
      }

      const timestamp = new Date().toLocaleTimeString()

      return {
        text,
        timestamp
      }
    } catch (error) {
      console.error('Transcription error:', error)
      throw error instanceof Error ? error : new Error('Failed to transcribe audio')
    }
  }
}
