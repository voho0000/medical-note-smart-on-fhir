/**
 * Chat History Store (Zustand)
 * 
 * Simplified to only manage UI state.
 * Server state (sessions) is now managed by React Query.
 * 
 * This store only handles:
 * - currentSessionId: Which session is currently active (UI state)
 */

import { create } from 'zustand'

interface ChatHistoryState {
  currentSessionId: string | null
  setCurrentSessionId: (sessionId: string | null) => void
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
  currentSessionId: null,
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
}))

// Convenience selectors
export const useCurrentSessionId = () => useChatHistoryStore(state => state.currentSessionId)
export const useSetCurrentSessionId = () => useChatHistoryStore(state => state.setCurrentSessionId)
