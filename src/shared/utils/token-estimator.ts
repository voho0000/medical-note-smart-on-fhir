// Token Estimation Utility
// Rough estimation: 1 token ≈ 4 characters for English, ≈ 1.5 characters for Chinese

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

// Model context window limits (conservative estimates to leave room for response)
export const CONTEXT_LIMITS = {
  'gpt-4o': 120000,
  'gpt-4-turbo': 120000,
  'gpt-4': 7000,
  'gpt-3.5-turbo': 15000,
  'gpt-5-mini': 15000,
  'gpt-5.1': 120000,
  'gpt-5.2': 120000,
  'gpt-5-pro': 120000,
  'gemini-2.5-flash': 900000,
  'gemini-3-flash-preview': 900000,
  'gemini-2.5-pro': 1800000,
  'gemini-3-pro-preview': 1800000,
  'default': 15000,
} as const

export function getContextLimit(modelId: string): number {
  return CONTEXT_LIMITS[modelId as keyof typeof CONTEXT_LIMITS] || CONTEXT_LIMITS.default
}
