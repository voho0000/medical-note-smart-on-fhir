// OpenAI Service Implementation
import type { AiQueryRequest, AiQueryResponse, AiMessage } from '@/src/core/entities/ai.entity'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { isGptModelId, getModelDefinition } from '@/src/shared/constants/ai-models.constants'
import { AiError, AiErrorCode } from '@/src/core/errors'
import type { IAiProvider, AiProviderConfig, StreamingOptions } from '@/src/core/interfaces/services/ai-provider.interface'

export class OpenAiService {
  readonly name = 'openai'

  constructor(private apiKey: string | null = null) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey || ENV_CONFIG.hasChatProxy)
  }

  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    const modelDef = getModelDefinition(request.modelId)
    // Check if model is OpenAI (including internal models) and can use proxy
    const isOpenAIModel = modelDef?.provider === 'openai'
    const shouldUseProxy = !this.apiKey && isOpenAIModel && !modelDef?.requiresUserKey && ENV_CONFIG.hasChatProxy

    if (!shouldUseProxy && !this.apiKey) {
      if (modelDef?.requiresUserKey) {
        throw new AiError(
          'This model requires a personal OpenAI API key',
          AiErrorCode.API_KEY_MISSING,
          { modelId: request.modelId }
        )
      }
      throw new AiError(
        'OpenAI API key or proxy is required',
        AiErrorCode.API_KEY_MISSING,
        { modelId: request.modelId }
      )
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

    // Special handling for gpt-5-mini and gpt-5-nano
    // Firebase proxy only supports temperature = 1 for these models
    if (request.modelId === 'gpt-5-mini' || request.modelId === 'gpt-5-nano') {
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
        const errorMessage = errorData.error?.message || errorData.error || 'OpenAI API request failed'
        
        // Determine error code based on status
        let errorCode = AiErrorCode.UNKNOWN_ERROR
        if (response.status === 401) {
          errorCode = AiErrorCode.API_KEY_INVALID
        } else if (response.status === 429) {
          errorCode = AiErrorCode.RATE_LIMIT_EXCEEDED
        } else if (response.status >= 500) {
          errorCode = AiErrorCode.NETWORK_ERROR
        }
        
        throw new AiError(
          this.sanitizeErrorMessage(errorMessage),
          errorCode,
          { modelId: request.modelId, status: response.status }
        )
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

  private sanitizeErrorMessage(message: string): string {
    // Remove actual API keys from error messages
    let sanitized = message
    
    // Remove OpenAI API key pattern (sk-...)
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[API_KEY_REDACTED]')
    
    // Remove Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [TOKEN_REDACTED]')
    
    // Check for sensitive keywords that indicate API key exposure
    const hasSensitiveInfo = /api[_-]?key[:\s]*["']?sk-/gi.test(message)
    if (hasSensitiveInfo) {
      return 'Authentication failed. Please check your API key.'
    }

    // Map common error codes to user-friendly messages
    if (sanitized.includes('401') || sanitized.includes('Unauthorized')) {
      return 'Authentication failed. Please check your API key.'
    }
    if (sanitized.includes('429') || sanitized.includes('rate limit')) {
      return 'Rate limit exceeded. Please try again later.'
    }
    if (sanitized.includes('500') || sanitized.includes('Internal Server Error')) {
      return 'Service temporarily unavailable. Please try again later.'
    }
    if (sanitized.includes('timeout')) {
      return 'Request timed out. Please try again.'
    }

    return sanitized
  }
}
