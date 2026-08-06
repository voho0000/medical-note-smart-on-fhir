// Chat message domain types.
//
// These lived in the zustand chat.store, which made core use-cases and the
// ChatSessionEntity import from the application layer (audit C3 — inverted
// dependency). The store now re-exports these for its existing consumers.

export interface ChatImage {
  data: string        // base64 data URL for API (full size)
  thumbnail?: string  // base64 data URL for storage/display (compressed)
  mimeType: string    // image/jpeg, image/png, etc.
  fileName?: string   // original file name
  size?: number       // file size in bytes
}

export interface AgentState {
  state: string
  timestamp: number
}

export interface ChatReplyReference {
  messageId: string
  role: "user" | "assistant" | "system"
  label: string
  excerpt: string
  timestamp: number
}

/**
 * Explicit data boundary for a chat turn. This is intentionally user-selected
 * rather than inferred from wording: routing heuristics may reduce schemas,
 * but they must never grant access to patient records or literature.
 */
export type ChatDataScope = 'general' | 'patient' | 'patient-literature'

export function isChatDataScope(value: unknown): value is ChatDataScope {
  return value === 'general' || value === 'patient' || value === 'patient-literature'
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  modelId?: string
  agentStates?: AgentState[]
  images?: ChatImage[]  // Support multiple images
  toolCalls?: string[]  // List of tool names that were called
  replyTo?: ChatReplyReference
  /** Scope active when this message was sent/generated. */
  dataScope?: ChatDataScope
}
