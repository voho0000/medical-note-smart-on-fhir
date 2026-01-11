/**
 * Application Hook: Literature Tools
 * 
 * Facade hook that provides literature search tools for AI agent interactions.
 * Isolates features from infrastructure layer details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing infrastructure
 */

import { useMemo } from 'react'
import { createLiteratureTools } from '@/src/infrastructure/ai/tools/literature-tools'

export function useLiteratureTools(perplexityApiKey: string | null) {
  // Cache literature tools to avoid recreating on every render
  const tools = useMemo(() => {
    if (!perplexityApiKey) return null
    return createLiteratureTools(perplexityApiKey)
  }, [perplexityApiKey])

  return tools
}
