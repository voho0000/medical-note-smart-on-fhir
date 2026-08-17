import { useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useChatSessionsQuery, useRemoveSessionMutation } from './use-chat-sessions-query.hook'
import { getChatSessionRepository } from '@/src/application/composition.chat'
import { DeleteChatSessionUseCase } from '@/src/core/use-cases/chat/delete-chat-session.use-case'
import { logger } from '@/src/shared/services/logger.service'

const repository = getChatSessionRepository()

export function useChatHistory(patientId?: string, fhirServerUrl?: string) {
  const { user } = useAuth()
  const userId = user?.uid
  const { data: sessions = [], isLoading, refetch } = useChatSessionsQuery(
    userId,
    patientId,
    fhirServerUrl
  )
  const { removeSession } = useRemoveSessionMutation()

  const loadHistory = useCallback(async () => {
    await refetch()
  }, [refetch])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!userId || !patientId || !fhirServerUrl) return

    try {
      const useCase = new DeleteChatSessionUseCase(repository)
      await useCase.execute(sessionId, userId)
      
      // Optimistically update React Query cache
      removeSession(userId, patientId, fhirServerUrl, sessionId)
      
      logger.info('[Chat History] Session deleted')
    } catch (error) {
      logger.error('[Chat History] Failed to delete session')
      throw error
    }
  }, [userId, patientId, fhirServerUrl, removeSession])

  return {
    sessions,
    isLoading,
    loadHistory,
    deleteSession,
  }
}
