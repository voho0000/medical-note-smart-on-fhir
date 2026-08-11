/**
 * Chat Store (Zustand)
 * 
 * Manages chat messages state and chat settings.
 * Replaces ChatMessagesProvider.
 */

import { create } from 'zustand'
import type { ChatDataScope, ChatMessage } from '@/src/core/entities/chat-message.entity'

// Domain types live in core (audit C3); re-exported here so existing
// consumers importing from the store keep working.
export type { ChatMessage, ChatImage, AgentState, ChatReplyReference, ChatDataScope } from '@/src/core/entities/chat-message.entity'

interface ChatState {
  messages: ChatMessage[]
  chatDataScope: ChatDataScope
  /**
   * Temporary / "incognito" chat mode (ChatGPT-style). When true, the
   * conversation is never persisted to Firestore — toggling it on starts a
   * fresh chat; toggling it off discards the in-memory contents.
   * Intentionally NOT persisted: a fresh tab / refresh always starts in the
   * standard saved-chat state (matches Chrome's incognito ephemeral semantics).
   */
  isTemporaryMode: boolean
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
  setIsTemporaryMode: (value: boolean) => void
  setChatDataScope: (value: ChatDataScope) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  chatDataScope: 'auto',
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

  setIsTemporaryMode: (value) => {
    set({ isTemporaryMode: value })
  },

  setChatDataScope: (value) => {
    set({ chatDataScope: value })
  },
}))

// Selectors with stable references for SSR
const selectMessages = (state: ChatState) => state.messages
const selectSetMessages = (state: ChatState) => state.setMessages
const selectAddMessage = (state: ChatState) => state.addMessage
const selectClearMessages = (state: ChatState) => state.clearMessages
const selectIsTemporaryMode = (state: ChatState) => state.isTemporaryMode
const selectSetIsTemporaryMode = (state: ChatState) => state.setIsTemporaryMode
const selectChatDataScope = (state: ChatState) => state.chatDataScope
const selectSetChatDataScope = (state: ChatState) => state.setChatDataScope

export const useChatMessages = () => useChatStore(selectMessages)
export const useSetChatMessages = () => useChatStore(selectSetMessages)
export const useAddChatMessage = () => useChatStore(selectAddMessage)
export const useClearChatMessages = () => useChatStore(selectClearMessages)
export const useIsTemporaryMode = () => useChatStore(selectIsTemporaryMode)
export const useSetIsTemporaryMode = () => useChatStore(selectSetIsTemporaryMode)
export const useChatDataScope = () => useChatStore(selectChatDataScope)
export const useSetChatDataScope = () => useChatStore(selectSetChatDataScope)
