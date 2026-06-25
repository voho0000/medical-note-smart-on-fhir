// Literature Search Tools for AI Agent
import { tool } from 'ai'
import { z } from 'zod'
import { perplexityService } from '../services/perplexity.service'
import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'

const literatureSearchSchema = z.object({
  query: z.string().describe('Medical search query. Should be in English for best results. Include specific medical terms, drug names, conditions, or research topics.'),
  searchDepth: z.enum(['basic', 'advanced']).optional().describe('Search depth: "basic" for quick answers (faster, cheaper), "advanced" for comprehensive research (slower, more detailed)'),
})

export function createLiteratureTools(perplexityKey: string | null, isUserAuthenticated: boolean = false, userId?: string) {
  // Return tools regardless of key availability
  // If no key is provided, it will use Firebase Proxy (if user is authenticated)
  return {
    searchMedicalLiterature: tool({
      description: 'Search medical literature, clinical guidelines, and evidence-based medical information from authoritative sources (PubMed, NIH, WHO, medical journals). Use this for: treatment guidelines, drug information, disease mechanisms, clinical trials, latest research findings, and evidence-based recommendations. Returns synthesized information together with source URLs. IMPORTANT: whenever you use this tool, you MUST cite those source URLs as links in your answer to the user — even if the user did not explicitly ask for sources.',
      inputSchema: literatureSearchSchema,
      execute: async ({ query, searchDepth = 'basic' }: z.infer<typeof literatureSearchSchema>) => {
        // Check if user has access to Perplexity (either via API key or authenticated for proxy)
        if (!perplexityKey && !isUserAuthenticated) {
          return {
            success: false,
            content: `🔐 To search medical literature, you need to either:\n\n1. **Sign in** to use free daily quota (${QUOTA_CONFIG.DAILY_LIMIT} searches/day), or\n2. **Add your Perplexity API key** in Settings\n\nPlease sign in or configure your API key to continue.`,
            source: 'Perplexity AI',
            requiresAuth: true,
          }
        }
        
        try {
          // Pass perplexityKey (can be null to use proxy if authenticated)
          const result = await perplexityService.searchLiterature(query, perplexityKey, searchDepth)
          
          // Track usage if using proxy (no API key) and user is authenticated
          if (!perplexityKey && isUserAuthenticated && userId && result.success) {
          }
          
          if (!result.success) {
            return {
              success: false,
              // Make the failure explicit so the model does NOT silently fall
              // back to its training data (which looks like a working answer but
              // isn't a real literature search). It must tell the user the
              // search failed and why.
              content:
                `⚠️ The medical literature search could not be completed (reason: ${result.error}). ` +
                'Do NOT answer from your own training data and do NOT fabricate any citations or sources. ' +
                'Tell the user that live literature search is temporarily unavailable and state the reason. ' +
                'If it looks like an API key or quota problem, suggest they check their Perplexity API key and remaining credit in Settings.',
              source: 'Perplexity AI',
            }
          }
          
          // Return raw content with citations
          // Citation processing will be handled uniformly by process-agent-stream.use-case.ts
          return {
            success: true,
            content: result.content,
            source: 'Perplexity AI (Medical Literature Search)',
            searchDepth,
            citationsCount: result.citations?.length || 0,
            citations: result.citations || [], // Pass citations array for post-processing
          }
        } catch (error) {
          return {
            success: false,
            content: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            source: 'Perplexity AI',
          }
        }
      },
    }),
  }
}
