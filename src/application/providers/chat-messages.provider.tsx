/**
 * Chat Messages Provider
 * Manages chat messages for Medical Chat feature
 * Single Responsibility: Chat message state management
 */
"use client"

import { createContext, useContext, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react'

export type AgentState = {
  state: string
  timestamp: number
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  modelId?: string
  agentStates?: AgentState[]
}

interface ChatMessagesContextValue {
  chatMessages: ChatMessage[]
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  clearMessages: () => void
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null)

export function ChatMessagesProvider({ children }: { children: ReactNode }) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const clearMessages = () => {
    setChatMessages([])
  }

  const value: ChatMessagesContextValue = useMemo(() => ({
    chatMessages,
    setChatMessages,
    clearMessages,
  }), [chatMessages])

  return (
    <ChatMessagesContext.Provider value={value}>
      {children}
    </ChatMessagesContext.Provider>
  )
}

export function useChatMessages() {
  const ctx = useContext(ChatMessagesContext)
  if (!ctx) {
    throw new Error('useChatMessages must be used inside <ChatMessagesProvider>')
  }
  return ctx
}
