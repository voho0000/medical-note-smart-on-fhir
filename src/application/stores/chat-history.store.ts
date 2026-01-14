import { create } from 'zustand'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

interface ChatHistoryState {
  sessions: ChatSessionMetadata[]
  currentSessionId: string | null
  isLoading: boolean
  
  setSessions: (sessions: ChatSessionMetadata[]) => void
  setCurrentSessionId: (sessionId: string | null) => void
  setIsLoading: (isLoading: boolean) => void
  addSession: (session: ChatSessionMetadata) => void
  updateSession: (sessionId: string, updates: Partial<ChatSessionMetadata>) => void
  removeSession: (sessionId: string) => void
  clearSessions: () => void
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: false,
  
  setSessions: (sessions) => set({ sessions }),
  
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  
  setIsLoading: (isLoading) => set({ isLoading }),
  
  addSession: (session) => set((state) => {
    // Check if session already exists
    const exists = state.sessions.some(s => s.id === session.id)
    if (exists) {
      // Update existing session instead of adding duplicate
      return {
        sessions: state.sessions.map(s => 
          s.id === session.id ? session : s
        )
      }
    }
    // Add new session at the beginning
    return {
      sessions: [session, ...state.sessions]
    }
  }),
  
  updateSession: (sessionId, updates) => set((state) => ({
    sessions: state.sessions.map(s => 
      s.id === sessionId ? { ...s, ...updates } : s
    )
  })),
  
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter(s => s.id !== sessionId),
    currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
  })),
  
  clearSessions: () => set({ sessions: [], currentSessionId: null })
}))

export const useChatSessions = () => useChatHistoryStore(state => state.sessions)
export const useCurrentSessionId = () => useChatHistoryStore(state => state.currentSessionId)
export const useSetCurrentSessionId = () => useChatHistoryStore(state => state.setCurrentSessionId)
export const useChatHistoryLoading = () => useChatHistoryStore(state => state.isLoading)
