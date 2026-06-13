/**
 * Proxy Fetch Interceptor
 * Intercepts fetch requests to add proxy headers and transform request body
 */

import { openAIRequestTransformer } from '../transformers/openai-request.transformer'
import { getProxyIdToken } from '../utils/proxy-auth'

export interface ProxyFetchConfig {
  proxyUrl: string
  proxyClientKey?: string
  isGemini: boolean
  isClaude?: boolean
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
      headers.delete('x-api-key')
      
      // Add proxy client key if available
      if (config.proxyClientKey) {
        headers.set('x-proxy-key', config.proxyClientKey)
      }

      // Proxy requires a signed-in user (audit A6): Authorization now carries
      // the Firebase ID token in place of the deleted provider key
      const idToken = await getProxyIdToken()
      if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`)
      }

      let body = init?.body

      if (config.isClaude) {
        // Anthropic messages payloads pass through verbatim — the Claude proxy
        // forwards them to /v1/messages unchanged
      } else if (config.isGemini) {
        // Pass the native Gemini body through (contents/tools/etc) instead of
        // flattening to {role, content:string}. The old transform dropped
        // functionCall/functionResponse parts (no `.text`), so multi-step
        // agent tool loops lost their results and Gemini gave up. The proxy
        // forwards it to Google verbatim; we only inject routing markers
        // (model is forced server-side; streaming is signalled by the SDK URL).
        body = this.markGeminiPassthrough(body, String(url))
      } else {
        // Transform OpenAI request format
        body = this.transformOpenAIRequest(body)
      }

      return originalFetch(config.proxyUrl, { ...init, headers, body })
    }
  }

  /**
   * Pass the AI SDK's native Gemini body through, injecting only routing
   * markers the proxy strips before forwarding to Google.
   */
  private markGeminiPassthrough(body: BodyInit | null | undefined, requestUrl: string): string | undefined {
    if (!body || typeof body !== 'string') {
      return body as string | undefined
    }
    try {
      const parsed = JSON.parse(body)
      // The SDK targets :streamGenerateContent for streaming, :generateContent otherwise
      parsed.__proxyStreaming = requestUrl.includes('streamGenerateContent')
      return JSON.stringify(parsed)
    } catch {
      return body
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
}

export const proxyFetchInterceptor = new ProxyFetchInterceptor()
