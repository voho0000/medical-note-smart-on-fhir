/**
 * Chat History Store (Zustand)
 * 
 * Simplified to only manage UI state.
 * Server state (sessions) is now managed by React Query.
 * 
 * This store only handles:
 * - currentSessionId: Which session is currently active (UI state)
 * - isTitleGenerating: Whether smart title is being generated (UI state)
 */

import { create } from 'zustand'

interface ChatHistoryState {
  currentSessionId: string | null
  isTitleGenerating: boolean
  setCurrentSessionId: (sessionId: string | null) => void
  setIsTitleGenerating: (isGenerating: boolean) => void
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
  currentSessionId: null,
  isTitleGenerating: false,
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  setIsTitleGenerating: (isGenerating) => set({ isTitleGenerating: isGenerating }),
}))

// Convenience selectors
export const useCurrentSessionId = () => useChatHistoryStore(state => state.currentSessionId)
export const useSetCurrentSessionId = () => useChatHistoryStore(state => state.setCurrentSessionId)
export const useIsTitleGenerating = () => useChatHistoryStore(state => state.isTitleGenerating)
export const useSetIsTitleGenerating = () => useChatHistoryStore(state => state.setIsTitleGenerating)
