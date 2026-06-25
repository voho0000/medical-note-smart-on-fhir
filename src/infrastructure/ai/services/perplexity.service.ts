// Perplexity API Service - Direct API calls with user-provided key
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getProxyAuthHeaders } from '../utils/proxy-auth'

export class PerplexityService {
  async searchLiterature(
    query: string, 
    apiKey: string | null,
    searchDepth: 'basic' | 'advanced' = 'basic'
  ): Promise<{
    success: boolean
    content: string
    citations?: string[]
    error?: string
  }> {
    // Every call goes through the owner's Firebase proxy. Browser-direct calls
    // to api.perplexity.ai are blocked at Perplexity's CDN (Cloudflare
    // bot-mitigation) — even though the API itself returns
    // `Access-Control-Allow-Origin: *`, a real browser request gets challenged
    // and the response carries no CORS header, so a client-side fetch fails with
    // an opaque CORS/connection error. The proxy runs server-side (no CDN
    // challenge). When the user supplied their own key we forward it so the
    // proxy bills THAT key and skips the daily quota; otherwise the proxy uses
    // the server key under the per-uid quota.
    return this.searchViaProxy(query, searchDepth, apiKey)
  }

  /**
   * Search via Firebase Cloud Function proxy
   * Uses environment variable NEXT_PUBLIC_PERPLEXITY_PROXY_URL
   */
  private async searchViaProxy(
    query: string,
    searchDepth: 'basic' | 'advanced',
    userKey: string | null = null,
  ): Promise<{
    success: boolean
    content: string
    citations?: string[]
    error?: string
  }> {
    const proxyUrl = process.env.NEXT_PUBLIC_PERPLEXITY_PROXY_URL

    if (!proxyUrl) {
      return {
        success: false,
        content: '',
        error: 'Perplexity proxy URL not configured. Please set NEXT_PUBLIC_PERPLEXITY_PROXY_URL in .env.local'
      }
    }

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ENV_CONFIG.proxyClientKey ? {'x-proxy-key': ENV_CONFIG.proxyClientKey} : {}),
          ...(await getProxyAuthHeaders()),
        },
        body: JSON.stringify({
          query,
          searchDepth,
          // Forward the user's own key (BYO) so the proxy bills it and skips the
          // daily quota. Omitted entirely when absent → proxy uses server key.
          ...(userKey ? { perplexityKey: userKey } : {}),
        })
      })

      const data = await response.json().catch(() => null)

      // The proxy returns the real upstream reason in `error` even on non-2xx
      // (e.g. "Perplexity API error: Invalid API key…" for a bad BYO key, or a
      // quota-exceeded message). Surface THAT instead of a generic status so the
      // user/agent learns the actual cause rather than failing silently.
      if (!response.ok || !data || data.success === false) {
        return {
          success: false,
          content: '',
          error: (data && data.error) || `Proxy error: ${response.status} ${response.statusText}`,
        }
      }

      // Try different possible response structures
      const result = data.result || data.data || data

      return {
        success: true,
        content: result.content || '',
        citations: result.citations || [],
      }
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Proxy call failed'
      }
    }
  }
}

export const perplexityService = new PerplexityService()
