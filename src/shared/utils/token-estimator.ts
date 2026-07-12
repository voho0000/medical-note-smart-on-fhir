// Token Estimation Utility
// Rough estimation: 1 token ≈ 4 characters for English, ≈ 1.5 characters for Chinese

import { getModelDefinition } from '@/src/shared/constants/ai-models.constants'

export function estimateTokens(text: string): number {
  if (!text) return 0
  
  // Count Chinese characters (CJK)
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  // Count other characters
  const otherChars = text.length - chineseChars
  
  // Chinese: ~1.5 chars per token, English: ~4 chars per token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

export function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  // Add overhead for message structure (role, formatting, etc.)
  const messageOverhead = messages.length * 4
  const contentTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0)
  return contentTokens + messageOverhead
}

// Context-window limits live on ModelDefinition (ai-models.constants.ts) so
// the model lineup and the truncation budget can never drift apart again.
// Unknown ids (e.g. a stale persisted model pick) fall back to a conservative
// floor rather than a guess.
export const DEFAULT_CONTEXT_LIMIT = 15000

export function getContextLimit(modelId: string): number {
  return getModelDefinition(modelId)?.contextLimit ?? DEFAULT_CONTEXT_LIMIT
}
