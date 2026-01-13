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
import { useAuth } from '@/src/application/providers/auth.provider'

export function useLiteratureTools(perplexityApiKey: string | null) {
  const { user } = useAuth()
  const isAuthenticated = !!user
  const userId = user?.uid
  
  // Cache literature tools to avoid recreating on every render
  // Now creates tools even without API key if user is authenticated (to use proxy)
  const tools = useMemo(() => {
    return createLiteratureTools(perplexityApiKey, isAuthenticated, userId)
  }, [perplexityApiKey, isAuthenticated, userId])

  return tools
}
