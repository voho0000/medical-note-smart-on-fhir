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
              content: 'You are a medical literature search assistant. Provide accurate, evidence-based medical information with citations from peer-reviewed sources, clinical guidelines, and authoritative medical resources. Always cite your sources with links when available.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 1500,
          temperature: 0.2,
          top_p: 0.9,
          search_domain_filter: ['pubmed.ncbi.nlm.nih.gov', 'nih.gov', 'who.int', 'uptodate.com'],
          return_citations: true,
          return_images: false,
          stream: false, // Non-streaming for tool calling
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
      const citations = data.citations || []

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
