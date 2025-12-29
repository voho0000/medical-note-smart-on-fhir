// OpenAI Service Implementation
import type { AiQueryRequest, AiQueryResponse, AiMessage } from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { isBuiltInModelId, getModelDefinition } from '@/src/shared/constants/ai-models.constants'

export class OpenAiService {
  constructor(private apiKey: string | null = null) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey || ENV_CONFIG.hasChatProxy)
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    const shouldUseProxy = !this.apiKey && isBuiltInModelId(request.modelId) && ENV_CONFIG.hasChatProxy

    if (!shouldUseProxy && !this.apiKey) {
      if (modelDef?.requiresUserKey) {
        throw new Error('This model requires a personal OpenAI API key')
      }
      throw new Error('OpenAI API key or proxy is required')
    }

    const targetUrl = shouldUseProxy ? ENV_CONFIG.chatProxyUrl : '/api/llm'
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: request.messages,
      stream: false,
    }

    // Special handling for gpt-5-mini
    if (request.modelId === 'gpt-5-mini') {
      body.temperature = 1
    } else if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (shouldUseProxy && ENV_CONFIG.proxyClientKey) {
      headers['x-proxy-key'] = ENV_CONFIG.proxyClientKey
    } else if (this.apiKey) {
      headers['x-openai-key'] = this.apiKey
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
        throw new Error(errorData.error?.message || errorData.error || 'OpenAI API request failed')
      }

      const data = await response.json()
      const text = this.extractOpenAiContent(data, shouldUseProxy)

      return {
        text,
        metadata: {
          modelId: request.modelId,
          provider: 'openai',
          tokensUsed: data.usage?.total_tokens,
        },
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private extractOpenAiContent(data: any, shouldUseProxy: boolean): string {
    if (shouldUseProxy) {
      // Proxy response format: { message: "...", openAiResponse: {...} }
      return data.message || data.text || data.choices?.[0]?.message?.content || ''
    }
    // Direct OpenAI API response format
    return data.choices?.[0]?.message?.content || ''
  }
}
