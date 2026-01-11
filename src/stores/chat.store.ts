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
  state: string
  timestamp: number
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

// Selectors with stable references for SSR
const selectMessages = (state: ChatState) => state.messages
const selectSetMessages = (state: ChatState) => state.setMessages
const selectAddMessage = (state: ChatState) => state.addMessage
const selectClearMessages = (state: ChatState) => state.clearMessages

export const useChatMessages = () => useChatStore(selectMessages)
export const useSetChatMessages = () => useChatStore(selectSetMessages)
export const useAddChatMessage = () => useChatStore(selectAddMessage)
export const useClearChatMessages = () => useChatStore(selectClearMessages)
