// Context Window Manager - Intelligently truncate chat history to fit token limits
import { estimateTokens, estimateMessagesTokens, getContextLimit } from './token-estimator'

export interface Message {
  role: string
  content: string
}

export interface ContextWindowConfig {
  modelId: string
  systemPrompt: string
  maxResponseTokens?: number // Reserve tokens for AI response
}

/**
 * Truncate messages to fit within model's context window
 * Strategy: Keep system prompt + recent messages that fit within limit
 */
export function truncateToContextWindow(
  messages: Message[],
  config: ContextWindowConfig
): Message[] {
  const contextLimit = getContextLimit(config.modelId)
  const maxResponseTokens = config.maxResponseTokens || 4000
  const availableTokens = contextLimit - maxResponseTokens
  
  // Always include system prompt
  const systemTokens = estimateTokens(config.systemPrompt)
  let remainingTokens = availableTokens - systemTokens
  
  if (remainingTokens <= 0) {
    console.warn('[ContextWindow] System prompt too long, truncating')
    return []
  }
  
  // Start from most recent messages and work backwards
  const truncatedMessages: Message[] = []
  let currentTokens = 0
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const msgTokens = estimateTokens(msg.content) + 4 // +4 for message overhead
    
    if (currentTokens + msgTokens > remainingTokens) {
      // Would exceed limit, stop here
      console.log(`[ContextWindow] Truncated to ${truncatedMessages.length}/${messages.length} messages (${currentTokens} tokens)`)
      break
    }
    
    truncatedMessages.unshift(msg)
    currentTokens += msgTokens
  }
  
  return truncatedMessages
}

/**
 * Check if messages would exceed context window
 */
export function wouldExceedContextWindow(
  messages: Message[],
  config: ContextWindowConfig
): boolean {
  const contextLimit = getContextLimit(config.modelId)
  const systemTokens = estimateTokens(config.systemPrompt)
  const messagesTokens = estimateMessagesTokens(messages)
  const maxResponseTokens = config.maxResponseTokens || 4000
  
  const totalTokens = systemTokens + messagesTokens + maxResponseTokens
  return totalTokens > contextLimit
}

/**
 * Get token usage statistics
 */
export function getTokenStats(
  messages: Message[],
  config: ContextWindowConfig
): {
  systemTokens: number
  messagesTokens: number
  totalTokens: number
  contextLimit: number
  remainingTokens: number
  utilizationPercent: number
} {
  const contextLimit = getContextLimit(config.modelId)
  const systemTokens = estimateTokens(config.systemPrompt)
  const messagesTokens = estimateMessagesTokens(messages)
  const totalTokens = systemTokens + messagesTokens
  const remainingTokens = Math.max(0, contextLimit - totalTokens)
  const utilizationPercent = Math.round((totalTokens / contextLimit) * 100)
  
  return {
    systemTokens,
    messagesTokens,
    totalTokens,
    contextLimit,
    remainingTokens,
    utilizationPercent,
  }
}
