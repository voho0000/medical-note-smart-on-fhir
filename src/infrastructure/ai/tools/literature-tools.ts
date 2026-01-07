// Literature Search Tools for AI Agent
import { tool } from 'ai'
import { z } from 'zod'
import { perplexityService } from '../services/perplexity.service'

const literatureSearchSchema = z.object({
  query: z.string().describe('Medical search query. Should be in English for best results. Include specific medical terms, drug names, conditions, or research topics.'),
  searchDepth: z.enum(['basic', 'advanced']).optional().describe('Search depth: "basic" for quick answers (faster, cheaper), "advanced" for comprehensive research (slower, more detailed)'),
})

export function createLiteratureTools(perplexityKey: string | null) {
  // Only return tools if Perplexity key is available
  if (!perplexityKey) {
    return {}
  }

  return {
    searchMedicalLiterature: tool({
      description: 'Search medical literature, clinical guidelines, and evidence-based medical information using Perplexity AI. Use this tool when the user asks about: medical research, treatment guidelines, drug information, disease mechanisms, clinical trials, latest medical findings, or evidence-based medicine. This tool searches recent medical literature from authoritative sources like PubMed, NIH, and WHO, and provides citations. DO NOT use this for patient-specific data (use FHIR tools instead).',
      inputSchema: literatureSearchSchema,
      execute: async ({ query, searchDepth = 'basic' }: z.infer<typeof literatureSearchSchema>) => {
        console.log('[Tool] searchMedicalLiterature started', { query, searchDepth })
        
        try {
          const result = await perplexityService.searchLiterature(query, perplexityKey, searchDepth)
          
          if (!result.success) {
            console.error('[Tool] searchMedicalLiterature error:', result.error)
            return {
              success: false,
              content: `Failed to search medical literature: ${result.error}`,
              source: 'Perplexity AI',
            }
          }
          
          console.log('[Tool] searchMedicalLiterature completed', { 
            contentLength: result.content.length,
            citationsCount: result.citations?.length || 0,
            preview: result.content.substring(0, 100)
          })
          
          // Format response with citations as clickable markdown links
          // Convert citation numbers [1][2] in content to clickable links
          let formattedContent = result.content
          
          if (result.citations && result.citations.length > 0) {
            // Replace citation numbers like [1] with clickable links
            result.citations.forEach((citation, index) => {
              const citationNum = index + 1
              const regex = new RegExp(`\\[${citationNum}\\]`, 'g')
              formattedContent = formattedContent.replace(regex, `[[${citationNum}]](${citation})`)
            })
            
            // Add sources list at the bottom with anchor IDs
            formattedContent += '\n\n**Sources:**\n' + result.citations.map((c, i) => `${i + 1}. [${c}](${c})`).join('\n')
          }
          
          return {
            success: true,
            content: formattedContent,
            source: 'Perplexity AI (Medical Literature Search)',
            searchDepth,
            citationsCount: result.citations?.length || 0,
            citations: result.citations || [], // Pass citations array for post-processing
          }
        } catch (error) {
          console.error('[Tool] searchMedicalLiterature unexpected error:', error)
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
