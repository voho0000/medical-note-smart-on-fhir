/**
 * Proxy Fetch Interceptor
 * Intercepts fetch requests to add proxy headers and transform request body
 */

import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { geminiRequestTransformer } from '../transformers/gemini-request.transformer'
import { openAIRequestTransformer } from '../transformers/openai-request.transformer'

export interface ProxyFetchConfig {
  proxyUrl: string
  proxyClientKey?: string
  isGemini: boolean
  modelId: string
}

export class ProxyFetchInterceptor {
  /**
   * Create custom fetch function for proxy requests
   */
  createProxyFetch(config: ProxyFetchConfig): typeof fetch {
    const originalFetch = globalThis.fetch

    return async (url, init) => {
      const headers = new Headers(init?.headers)
      
      // Remove API keys - proxy will use its own
      headers.delete('authorization')
      headers.delete('x-goog-api-key')
      
      // Add proxy client key if available
      if (config.proxyClientKey) {
        headers.set('x-proxy-key', config.proxyClientKey)
      }

      let body = init?.body

      if (config.isGemini) {
        // Transform Gemini request format
        body = this.transformGeminiRequest(body, config.modelId)
      } else {
        // Transform OpenAI request format
        body = this.transformOpenAIRequest(body)
      }

      return originalFetch(config.proxyUrl, { ...init, headers, body })
    }
  }

  /**
   * Transform OpenAI request: convert "developer" role to "system"
   * AI SDK uses "developer" for newer OpenAI models, but OpenAI API expects "system"
   */
  private transformOpenAIRequest(body?: BodyInit | null): string | undefined {
    if (!body || typeof body !== 'string') {
      return body as string | undefined
    }

    try {
      const parsed = JSON.parse(body)
      const transformed = openAIRequestTransformer.transform(parsed)
      return JSON.stringify(transformed)
    } catch {
      // Keep original body if parsing fails
    }

    return body
  }

  /**
   * Transform Gemini request: convert AI SDK native format to proxy format
   */
  private transformGeminiRequest(body?: BodyInit | null, modelId?: string): string | undefined {
    if (!body || typeof body !== 'string' || !modelId) {
      return body as string | undefined
    }

    try {
      const parsed = JSON.parse(body)
      const transformed = geminiRequestTransformer.transform(parsed, modelId)
      return JSON.stringify(transformed)
    } catch {
      // Keep original body if parsing fails
    }

    return body
  }
}

export const proxyFetchInterceptor = new ProxyFetchInterceptor()
