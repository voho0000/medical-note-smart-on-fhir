// Perplexity API Service - Direct API calls with user-provided key
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
    // If no API key provided, use Firebase Proxy
    if (!apiKey) {
      return this.searchViaProxy(query, searchDepth)
    }

    try {
      // Select model based on search depth
      // Updated model names as of 2024 - see https://docs.perplexity.ai/guides/model-cards
      const model = searchDepth === 'advanced' 
        ? 'sonar-pro'  // More comprehensive but more expensive
        : 'sonar'      // Fast and cost-effective

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a medical literature search assistant. Provide accurate, evidence-based medical information with citations from authoritative medical sources including: PubMed, NIH, Cochrane Library, NEJM, The Lancet, JAMA, BMJ, UpToDate, WHO, CDC, FDA, Mayo Clinic, and other peer-reviewed medical journals and clinical guidelines. IMPORTANT: In your "Sources" section at the end, ONLY list the URLs that you directly cited with reference numbers [1][2][3] etc. in your response. Do not list additional URLs that you searched but did not cite.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 1500,
          temperature: 0.2,
          top_p: 0.9,
          // Note: return_citations is not supported in Chat Completions API
          // Citations are automatically included in the response
        }),
      })

      if (!response.ok) {
        return {
          success: false,
          content: '',
          error: `Perplexity API error: ${response.status} ${response.statusText}`
        }
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      // Citations can be in multiple places depending on API version
      const citations = data.citations || data.choices?.[0]?.message?.citations || []

      return {
        success: true,
        content,
        citations,
      }
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Search via Firebase Cloud Function proxy
   * Uses environment variable NEXT_PUBLIC_PERPLEXITY_PROXY_URL
   */
  private async searchViaProxy(
    query: string,
    searchDepth: 'basic' | 'advanced'
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
        },
        body: JSON.stringify({
          query,
          searchDepth
        })
      })

      if (!response.ok) {
        return {
          success: false,
          content: '',
          error: `Proxy error: ${response.status} ${response.statusText}`
        }
      }

      const data = await response.json()
      
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
