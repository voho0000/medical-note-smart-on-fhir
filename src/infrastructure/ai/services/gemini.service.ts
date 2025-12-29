// Gemini Service Implementation
import type { AiQueryRequest, AiQueryResponse, AiMessage } from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getModelDefinition } from '@/src/shared/constants/ai-models.constants'

export class GeminiService {
  constructor(private apiKey: string | null = null) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey || ENV_CONFIG.hasGeminiProxy)
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const shouldUseProxy = !this.apiKey && ENV_CONFIG.hasGeminiProxy

    if (!shouldUseProxy && !this.apiKey) {
      throw new Error('Gemini API key is required for this model')
    }

    const targetUrl = shouldUseProxy ? '/api/gemini-proxy' : this.buildDirectApiUrl(request.modelId)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: request.messages,
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (shouldUseProxy && ENV_CONFIG.proxyClientKey) {
      headers['x-proxy-key'] = ENV_CONFIG.proxyClientKey
    } else if (this.apiKey) {
      headers['x-goog-api-key'] = this.apiKey
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error?.message || errorData.error || 'Gemini API request failed')
      }

      const data = await response.json()
      const text = this.extractGeminiContent(data, shouldUseProxy)

      return {
        text,
        metadata: {
          modelId: request.modelId,
          provider: 'gemini',
          tokensUsed: data.usageMetadata?.totalTokenCount || data.usage?.total_tokens,
        },
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private buildDirectApiUrl(modelId: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
  }

  private extractGeminiContent(data: any, shouldUseProxy: boolean): string {
    if (shouldUseProxy) {
      // Proxy response format may vary
      return data.message || data.text || data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }
    // Direct Gemini API response format
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

}
