/**
 * Chat Store (Zustand)
 * 
 * Manages chat messages state and chat settings.
 * Replaces ChatMessagesProvider.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  autoIncludeContext: boolean
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
  setAutoIncludeContext: (value: boolean) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      autoIncludeContext: true, // Default to true (auto-include)
      
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
      
      setAutoIncludeContext: (value) => {
        set({ autoIncludeContext: value })
      },
    }),
    {
      name: 'chat-settings',
      partialize: (state) => ({ autoIncludeContext: state.autoIncludeContext }),
    }
  )
)

// Selectors with stable references for SSR
const selectMessages = (state: ChatState) => state.messages
const selectSetMessages = (state: ChatState) => state.setMessages
const selectAddMessage = (state: ChatState) => state.addMessage
const selectClearMessages = (state: ChatState) => state.clearMessages
const selectAutoIncludeContext = (state: ChatState) => state.autoIncludeContext
const selectSetAutoIncludeContext = (state: ChatState) => state.setAutoIncludeContext

export const useChatMessages = () => useChatStore(selectMessages)
export const useSetChatMessages = () => useChatStore(selectSetMessages)
export const useAddChatMessage = () => useChatStore(selectAddMessage)
export const useClearChatMessages = () => useChatStore(selectClearMessages)
export const useAutoIncludeContext = () => useChatStore(selectAutoIncludeContext)
export const useSetAutoIncludeContext = () => useChatStore(selectSetAutoIncludeContext)
