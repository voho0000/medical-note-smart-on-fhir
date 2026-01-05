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
        const errorMessage = this.sanitizeErrorMessage(errorData.error?.message || errorData.error || 'Gemini API request failed')
        throw new Error(errorMessage)
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

  private sanitizeErrorMessage(message: string): string {
    // Remove actual API keys from error messages
    let sanitized = message
    
    // Remove Google API key pattern (AIza...)
    sanitized = sanitized.replace(/AIza[a-zA-Z0-9_-]{20,}/g, '[API_KEY_REDACTED]')
    
    // Remove Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [TOKEN_REDACTED]')
    
    // Check for sensitive keywords that indicate API key exposure
    const hasSensitiveInfo = /api[_-]?key[:\s]*["']?AIza/gi.test(message)
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
