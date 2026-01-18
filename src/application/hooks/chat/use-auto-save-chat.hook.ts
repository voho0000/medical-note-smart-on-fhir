import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useAddSessionMutation, useUpdateSessionMutation } from './use-chat-sessions-query.hook'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { SaveChatSessionUseCase } from '@/src/core/use-cases/chat/save-chat-session.use-case'
import { UpdateChatSessionUseCase } from '@/src/core/use-cases/chat/update-chat-session.use-case'
import { logger } from '@/src/shared/services/logger.service'

const repository = new FirestoreChatSessionRepository()
const saveChatSessionUseCase = new SaveChatSessionUseCase(repository)
const updateChatSessionUseCase = new UpdateChatSessionUseCase(repository)
const autoSaveLogger = logger.scope('Auto-save')

interface UseAutoSaveChatOptions {
  patientId?: string
  fhirServerUrl?: string
  debounceMs?: number
  enabled?: boolean
}

export function useAutoSaveChat({
  patientId,
  fhirServerUrl,
  debounceMs = 5000,
  enabled = true
}: UseAutoSaveChatOptions) {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const messages = useChatStore(state => state.messages)
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const setCurrentSessionId = useChatHistoryStore(state => state.setCurrentSessionId)
  const { addSession } = useAddSessionMutation()
  const { updateSession } = useUpdateSessionMutation()
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastSavedMessageCountRef = useRef(0)
  const isSavingRef = useRef(false)
  const prevMessageCountRef = useRef(0)

  // Reset lastSavedMessageCountRef when session changes
  useEffect(() => {
    lastSavedMessageCountRef.current = 0
    prevMessageCountRef.current = 0
  }, [currentSessionId])

  const saveSession = useCallback(async () => {
    // Get fresh messages from store to avoid closure issues
    const { messages: currentMessages } = useChatStore.getState()
    const { currentSessionId } = useChatHistoryStore.getState()
    
    // Only require user to be logged in
    if (!user?.uid) {
      return
    }

    // Use fallback values when FHIR data is not available
    const effectivePatientId = patientId || 'no-patient'
    const effectiveFhirServerUrl = fhirServerUrl || 'no-fhir-server'

    if (currentMessages.length === 0) {
      return
    }

    if (currentMessages.length === lastSavedMessageCountRef.current) {
      return
    }

    if (isSavingRef.current) {
      return
    }

    isSavingRef.current = true

    try {
      if (!currentSessionId) {
        const newSession = await saveChatSessionUseCase.execute({
          userId: user.uid,
          fhirServerUrl: effectiveFhirServerUrl,
          patientId: effectivePatientId,
          messages: currentMessages,
          locale,
        })

        setCurrentSessionId(newSession.id)
        addSession(
          user.uid,
          effectivePatientId,
          effectiveFhirServerUrl,
          {
            id: newSession.id,
            userId: newSession.userId,
            fhirServerUrl: newSession.fhirServerUrl,
            patientId: newSession.patientId,
            title: newSession.title,
            summary: newSession.summary,
            createdAt: newSession.createdAt,
            updatedAt: newSession.updatedAt,
            messageCount: newSession.messageCount,
            tags: newSession.tags,
          }
        )

      } else {
        await updateChatSessionUseCase.execute(currentSessionId, user.uid, {
          messages: currentMessages,
        })

        updateSession(
          user.uid,
          effectivePatientId,
          effectiveFhirServerUrl,
          currentSessionId,
          {
            updatedAt: new Date(),
            messageCount: currentMessages.length,
          }
        )

      }

      lastSavedMessageCountRef.current = currentMessages.length
    } catch (error) {
      autoSaveLogger.error('Failed to save chat session', error)
    } finally {
      isSavingRef.current = false
    }
  }, [
    user?.uid,
    patientId,
    fhirServerUrl,
    setCurrentSessionId,
    addSession,
    updateSession,
  ])

  // Track last message content to detect when streaming completes
  const lastMessageContentRef = useRef<string>('')
  
  useEffect(() => {
    const messageCount = messages.length
    const lastMessage = messages[messages.length - 1]
    const lastMessageContent = lastMessage?.content || ''
    
    // Check if this is a meaningful change (count changed OR content changed from thinking state)
    const countChanged = messageCount !== prevMessageCountRef.current
    const contentChanged = lastMessageContent !== lastMessageContentRef.current
    const wasThinking = lastMessageContentRef.current.includes('🤔') || lastMessageContentRef.current.includes('思考中') || lastMessageContentRef.current.includes('🔍') || lastMessageContentRef.current.includes('📝')
    const isNowComplete = !lastMessageContent.includes('🤔') && !lastMessageContent.includes('思考中') && !lastMessageContent.includes('🔍') && !lastMessageContent.includes('📝')
    
    // Update refs
    lastMessageContentRef.current = lastMessageContent
    
    // Skip if nothing meaningful changed
    if (!countChanged && !(contentChanged && wasThinking && isNowComplete)) {
      return
    }
    
    prevMessageCountRef.current = messageCount
    
    // Skip if last message is empty or still in thinking state (streaming just started or incomplete)
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content.trim()
      // Check if message is empty or still showing thinking state
      if (!content || content.includes('🤔') || content.includes('思考中') || content.includes('🔍') || content.includes('📝')) {
        return
      }
      // Check if message has agentStates (deep mode) - wait for completion
      if ('agentStates' in lastMessage && Array.isArray(lastMessage.agentStates) && lastMessage.agentStates.length > 0) {
        const lastState = lastMessage.agentStates[lastMessage.agentStates.length - 1]
        if (lastState?.state?.includes('🤔') || lastState?.state?.includes('思考中')) {
          return
        }
      }
    }
    
    if (!enabled) {
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (messageCount === 0) {
      return
    }

    if (messageCount === lastSavedMessageCountRef.current) {
      return
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveSession()
    }, debounceMs)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [messages, enabled, debounceMs, saveSession])

  const forceSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    await saveSession()
  }, [saveSession])

  return {
    forceSave,
    isSaving: isSavingRef.current,
  }
}
