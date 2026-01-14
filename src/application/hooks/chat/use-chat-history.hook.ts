import { useEffect, useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { GetChatHistoryUseCase } from '@/src/core/use-cases/chat/get-chat-history.use-case'
import { DeleteChatSessionUseCase } from '@/src/core/use-cases/chat/delete-chat-session.use-case'

const repository = new FirestoreChatSessionRepository()
const getChatHistoryUseCase = new GetChatHistoryUseCase(repository)
const deleteChatSessionUseCase = new DeleteChatSessionUseCase(repository)

export function useChatHistory(patientId?: string, fhirServerUrl?: string) {
  const { user } = useAuth()
  const sessions = useChatHistoryStore(state => state.sessions)
  const isLoading = useChatHistoryStore(state => state.isLoading)
  const setSessions = useChatHistoryStore(state => state.setSessions)
  const setIsLoading = useChatHistoryStore(state => state.setIsLoading)
  const removeSession = useChatHistoryStore(state => state.removeSession)

  const loadHistory = useCallback(async () => {
    if (!user?.uid || !patientId || !fhirServerUrl) {
      setSessions([])
      return
    }

    setIsLoading(true)
    try {
      const history = await getChatHistoryUseCase.execute(
        user.uid,
        patientId,
        fhirServerUrl
      )
      setSessions(history)
    } catch (error) {
      console.error('[Chat History] Failed to load:', error)
      setSessions([])
    } finally {
      setIsLoading(false)
    }
  }, [user?.uid, patientId, fhirServerUrl, setSessions, setIsLoading])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user?.uid) return

    try {
      await deleteChatSessionUseCase.execute(sessionId, user.uid)
      removeSession(sessionId)
    } catch (error) {
      console.error('[Chat History] Failed to delete:', error)
      throw error
    }
  }, [user?.uid, removeSession])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (!user?.uid || !patientId || !fhirServerUrl) return

    const unsubscribe = repository.subscribe(
      user.uid,
      patientId,
      fhirServerUrl,
      (updatedSessions) => {
        setSessions(updatedSessions)
      }
    )

    return () => unsubscribe()
  }, [user?.uid, patientId, fhirServerUrl, setSessions])

  return {
    sessions,
    isLoading,
    loadHistory,
    deleteSession
  }
}
