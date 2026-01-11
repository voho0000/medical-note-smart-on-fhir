/**
 * Use Case: Send Chat Message
 * Business logic for sending chat messages and getting AI responses
 * Following Clean Architecture principles
 */

import type { AiMessage } from '@/src/core/entities/ai.entity'

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  modelId?: string
}

export interface SendMessageInput {
  userMessage: string
  conversationHistory: ChatMessage[]
  systemPrompt: string
  modelId: string
}

export interface SendMessageOutput {
  messages: AiMessage[]
  assistantMessageId: string
}

/**
 * Send Message Use Case
 * Pure business logic without state management
 */
export class SendMessageUseCase {
  /**
   * Create a new chat message
   */
  createMessage(role: ChatMessage["role"], content: string, modelId?: string): ChatMessage {
    return {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto 
        ? crypto.randomUUID() 
        : `${role}-${Date.now()}`,
      role,
      content,
      timestamp: Date.now(),
      modelId,
    }
  }

  /**
   * Validate input before sending
   */
  validate(input: SendMessageInput): { valid: boolean; error?: string } {
    if (!input.userMessage.trim()) {
      return { valid: false, error: 'Message cannot be empty' }
    }

    if (!input.systemPrompt.trim()) {
      return { valid: false, error: 'System prompt is required' }
    }

    if (!input.modelId) {
      return { valid: false, error: 'Model ID is required' }
    }

    return { valid: true }
  }

  /**
   * Build AI messages from conversation history
   */
  buildMessages(input: SendMessageInput): AiMessage[] {
    const messages: AiMessage[] = [
      { role: "system" as const, content: input.systemPrompt },
    ]

    // Add conversation history
    for (const msg of input.conversationHistory) {
      messages.push({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })
    }

    return messages
  }

  /**
   * Prepare data for sending a message
   * Returns the user message and AI messages to send
   */
  prepareMessageSend(input: SendMessageInput): SendMessageOutput {
    const userMessage = this.createMessage("user", input.userMessage.trim())
    const updatedHistory = [...input.conversationHistory, userMessage]
    
    const messages = this.buildMessages({
      ...input,
      conversationHistory: updatedHistory,
    })

    const assistantMessageId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `assistant-${Date.now()}`

    return {
      messages,
      assistantMessageId,
    }
  }
}

// Export singleton instance
export const sendMessageUseCase = new SendMessageUseCase()
