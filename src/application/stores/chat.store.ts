/**
 * Chat Store (Zustand)
 * 
 * Manages chat messages state and chat settings.
 * Replaces ChatMessagesProvider.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '@/src/core/entities/chat-message.entity'

// Domain types live in core (audit C3); re-exported here so existing
// consumers importing from the store keep working.
export type { ChatMessage, ChatImage, AgentState } from '@/src/core/entities/chat-message.entity'

interface ChatState {
  messages: ChatMessage[]
  autoIncludeContext: boolean
  /**
   * Temporary / "incognito" chat mode (ChatGPT-style). When true, the
   * conversation is never persisted to Firestore — toggling it on starts a
   * fresh chat; toggling it off discards the in-memory contents.
   * Intentionally NOT persisted: a fresh tab / refresh always starts in
   * normal mode (matches Chrome's incognito ephemeral semantics).
   */
  isTemporaryMode: boolean
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
  setAutoIncludeContext: (value: boolean) => void
  setIsTemporaryMode: (value: boolean) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      // Mode-derived at runtime (MedicalChat syncs it to !isAgentMode). Seeded
      // off to match the default mode (deep), avoiding a first-render flash.
      autoIncludeContext: false,
      isTemporaryMode: false,

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

      setIsTemporaryMode: (value) => {
        set({ isTemporaryMode: value })
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
const selectIsTemporaryMode = (state: ChatState) => state.isTemporaryMode
const selectSetIsTemporaryMode = (state: ChatState) => state.setIsTemporaryMode

export const useChatMessages = () => useChatStore(selectMessages)
export const useSetChatMessages = () => useChatStore(selectSetMessages)
export const useAddChatMessage = () => useChatStore(selectAddMessage)
export const useClearChatMessages = () => useChatStore(selectClearMessages)
export const useAutoIncludeContext = () => useChatStore(selectAutoIncludeContext)
export const useSetAutoIncludeContext = () => useChatStore(selectSetAutoIncludeContext)
export const useIsTemporaryMode = () => useChatStore(selectIsTemporaryMode)
export const useSetIsTemporaryMode = () => useChatStore(selectSetIsTemporaryMode)
