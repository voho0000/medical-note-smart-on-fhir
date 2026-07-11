/**
 * Chat Message Utilities
 * 
 * Shared utilities for creating and managing chat messages.
 * Eliminates code duplication across chat hooks.
 */
import type {
  AgentState,
  ChatImage,
  ChatMessage,
  ChatReplyReference,
} from "@/src/core/entities/chat-message.entity"

export const CHAT_REPLY_EXCERPT_LIMIT = 1500

export function normalizeReplyExcerpt(
  text: string,
  limit: number = CHAT_REPLY_EXCERPT_LIMIT,
): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`
}

export function createReplyReference(
  source: ChatMessage,
  selectedText: string,
  label: string,
): ChatReplyReference | null {
  const excerpt = normalizeReplyExcerpt(selectedText)
  if (!excerpt) return null
  return {
    messageId: source.id,
    role: source.role,
    label,
    excerpt,
    timestamp: source.timestamp,
  }
}

export function formatChatMessageContentForAi(message: Pick<ChatMessage, 'content' | 'replyTo'>): string {
  if (!message.replyTo?.excerpt) return message.content
  const content = message.content.trim()

  return [
    `User is replying to this ${message.replyTo.role} message excerpt:`,
    '<quote>',
    message.replyTo.excerpt,
    '</quote>',
    '',
    'User message:',
    content,
  ].join('\n')
}

/**
 * Create a user message
 */
export function createUserMessage(
  content: string,
  images?: ChatImage[],
  replyTo?: ChatReplyReference | null,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: content.trim(),
    timestamp: Date.now(),
    images,
    ...(replyTo ? { replyTo } : {}),
  }
}

/**
 * Create an assistant message placeholder
 */
export function createAssistantMessage(
  modelId?: string,
  initialContent: string = "",
  agentStates?: AgentState[]
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: initialContent,
    timestamp: Date.now(),
    modelId,
    agentStates,
  }
}

/**
 * Create an agent state
 */
export function createAgentState(state: string): AgentState {
  return {
    state,
    timestamp: Date.now(),
  }
}

/**
 * Add user message and assistant placeholder to chat
 * Returns the new messages array and assistant message ID
 */
export function addMessagePair(
  currentMessages: ChatMessage[],
  userInput: string,
  modelId?: string,
  assistantInitialContent?: string,
  images?: ChatImage[],
  agentStates?: AgentState[],
  replyTo?: ChatReplyReference | null,
): { messages: ChatMessage[]; assistantMessageId: string } {
  const userMessage = createUserMessage(userInput, images, replyTo)
  const messagesWithUser = [...currentMessages, userMessage]
  
  const assistantMessage = createAssistantMessage(
    modelId,
    assistantInitialContent,
    agentStates
  )
  
  return {
    messages: [...messagesWithUser, assistantMessage],
    assistantMessageId: assistantMessage.id,
  }
}
