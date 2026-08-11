import { useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { getChatSessionRepository } from '@/src/application/composition.chat'
import { LoadChatSessionUseCase } from '@/src/core/use-cases/chat/load-chat-session.use-case'
import { logger } from '@/src/shared/services/logger.service'
import {
  isChatDataScope,
  type ChatDataScope,
} from '@/src/core/entities/chat-message.entity'
// Note: we mutate isTemporaryMode via useChatStore.getState() instead of a
// subscribing selector — loadSession is an imperative action, no need to
// re-render this hook when temp mode flips.

const repository = getChatSessionRepository()
const loadChatSessionUseCase = new LoadChatSessionUseCase(repository)
const chatSessionLogger = logger.scope('Chat Session')

export function useChatSession() {
  const { user } = useAuth()
  const setMessages = useChatStore(state => state.setMessages)
  const setChatDataScope = useChatStore(state => state.setChatDataScope)
  const setCurrentSessionId = useChatHistoryStore(state => state.setCurrentSessionId)

  const loadSession = useCallback(async (sessionId: string) => {
    if (!user?.uid) {
      chatSessionLogger.warn('No user logged in')
      return
    }

    try {
      const session = await loadChatSessionUseCase.execute(sessionId, user.uid)

      if (session) {
        // Loading a saved session implies the user wants persistent chat —
        // auto-exit temporary mode so further edits get saved.
        useChatStore.getState().setIsTemporaryMode(false)
        setMessages(session.messages)
        const savedScope = [...session.messages]
          .reverse()
          .find((message) => isChatDataScope(message.dataScope))
          ?.dataScope
        setChatDataScope(savedScope ?? (
          session.patientId && session.patientId !== 'no-patient'
            ? 'patient'
            : 'general'
        ))
        setCurrentSessionId(session.id)

        return session
      } else {
        chatSessionLogger.warn('Session not found', { sessionId })
      }
    } catch (error) {
      chatSessionLogger.error('Failed to load', error)
      throw error
    }
  }, [user, setMessages, setChatDataScope, setCurrentSessionId])

  const startNewSession = useCallback((defaultScope: ChatDataScope = 'general') => {
    setMessages([])
    setChatDataScope(defaultScope)
    setCurrentSessionId(null)
  }, [setMessages, setChatDataScope, setCurrentSessionId])

  return {
    loadSession,
    startNewSession
  }
}
