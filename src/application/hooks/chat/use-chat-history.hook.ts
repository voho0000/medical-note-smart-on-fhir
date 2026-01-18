import { useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useChatSessionsQuery, useRemoveSessionMutation } from './use-chat-sessions-query.hook'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { DeleteChatSessionUseCase } from '@/src/core/use-cases/chat/delete-chat-session.use-case'
import { logger } from '@/src/shared/services/logger.service'

const repository = new FirestoreChatSessionRepository()

export function useChatHistory(patientId?: string, fhirServerUrl?: string) {
  const { user } = useAuth()
  const { data: sessions = [], isLoading, refetch } = useChatSessionsQuery(
    user?.uid,
    patientId,
    fhirServerUrl
  )
  const { removeSession } = useRemoveSessionMutation()

  const loadHistory = useCallback(async () => {
    await refetch()
  }, [refetch])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user?.uid || !patientId || !fhirServerUrl) return

    try {
      const useCase = new DeleteChatSessionUseCase(repository)
      await useCase.execute(sessionId, user.uid)
      
      // Optimistically update React Query cache
      removeSession(user.uid, patientId, fhirServerUrl, sessionId)
      
      logger.info('[Chat History] Session deleted')
    } catch (error) {
      logger.error('[Chat History] Failed to delete session')
      throw error
    }
  }, [user?.uid, patientId, fhirServerUrl, removeSession])

  return {
    sessions,
    isLoading,
    loadHistory,
    deleteSession,
  }
}
