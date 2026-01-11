/**
 * Chat Store (Zustand)
 * 
 * Manages chat messages state.
 * Replaces ChatMessagesProvider.
 */

import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  modelId?: string
  agentStates?: AgentState[]
}

export interface AgentState {
  id: string
  timestamp: number
  message: string
}

interface ChatState {
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  
  setMessages: (messages) => {
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages
    }))
  },
  
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message]
    }))
  },
  
  clearMessages: () => {
    set({ messages: [] })
  },
}))

// Selectors
export const useChatMessages = () => useChatStore((state) => state.messages)
export const useSetChatMessages = () => useChatStore((state) => state.setMessages)
export const useAddChatMessage = () => useChatStore((state) => state.addMessage)
export const useClearChatMessages = () => useChatStore((state) => state.clearMessages)
