// Perplexity API Service - Direct API calls with user-provided key
export class PerplexityService {
  async searchLiterature(
    query: string, 
    apiKey: string,
    searchDepth: 'basic' | 'advanced' = 'basic'
  ): Promise<{
    success: boolean
    content: string
    citations?: string[]
    error?: string
  }> {
    if (!apiKey) {
      return {
        success: false,
        content: '',
        error: 'Perplexity API key is required'
      }
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
        const errorText = await response.text()
        console.error('Perplexity API error:', errorText)
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
      console.error('Perplexity search error:', error)
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }
}

export const perplexityService = new PerplexityService()
