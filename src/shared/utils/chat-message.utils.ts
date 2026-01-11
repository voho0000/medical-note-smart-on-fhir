/**
 * Chat Message Utilities
 * 
 * Shared utilities for creating and managing chat messages.
 * Eliminates code duplication across chat hooks.
 */
import type { ChatMessage, AgentState } from "@/src/stores/chat.store"

/**
 * Create a user message
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: content.trim(),
    timestamp: Date.now(),
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
  agentStates?: AgentState[]
): { messages: ChatMessage[]; assistantMessageId: string } {
  const userMessage = createUserMessage(userInput)
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
