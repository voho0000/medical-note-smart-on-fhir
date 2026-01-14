import { useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { LoadChatSessionUseCase } from '@/src/core/use-cases/chat/load-chat-session.use-case'

const repository = new FirestoreChatSessionRepository()
const loadChatSessionUseCase = new LoadChatSessionUseCase(repository)

export function useChatSession() {
  const { user } = useAuth()
  const setMessages = useChatStore(state => state.setMessages)
  const setCurrentSessionId = useChatHistoryStore(state => state.setCurrentSessionId)

  const loadSession = useCallback(async (sessionId: string) => {
    if (!user?.uid) {
      console.warn('[Chat Session] No user logged in')
      return
    }

    try {
      const session = await loadChatSessionUseCase.execute(sessionId, user.uid)
      
      if (session) {
        setMessages(session.messages)
        setCurrentSessionId(session.id)
        
        return session
      } else {
        console.warn('[Chat Session] Session not found:', sessionId)
      }
    } catch (error) {
      console.error('[Chat Session] Failed to load:', error)
      throw error
    }
  }, [user?.uid, setMessages, setCurrentSessionId])

  const startNewSession = useCallback(() => {
    setMessages([])
    setCurrentSessionId(null)
  }, [setMessages, setCurrentSessionId])

  return {
    loadSession,
    startNewSession
  }
}
