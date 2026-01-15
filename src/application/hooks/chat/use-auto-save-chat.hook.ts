import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { SaveChatSessionUseCase } from '@/src/core/use-cases/chat/save-chat-session.use-case'
import { UpdateChatSessionUseCase } from '@/src/core/use-cases/chat/update-chat-session.use-case'

const repository = new FirestoreChatSessionRepository()
const saveChatSessionUseCase = new SaveChatSessionUseCase(repository)
const updateChatSessionUseCase = new UpdateChatSessionUseCase(repository)

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
  const addSession = useChatHistoryStore(state => state.addSession)
  const updateSession = useChatHistoryStore(state => state.updateSession)
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastSavedMessageCountRef = useRef(0)
  const isSavingRef = useRef(false)
  const prevMessageCountRef = useRef(0)

  // Reset lastSavedMessageCountRef when session changes
  useEffect(() => {
    console.log('[Auto-save] Session changed, resetting lastSavedCount')
    lastSavedMessageCountRef.current = 0
    prevMessageCountRef.current = 0
  }, [currentSessionId])

  const saveSession = useCallback(async () => {
    // Get fresh messages from store to avoid closure issues
    const { messages: currentMessages } = useChatStore.getState()
    const { currentSessionId } = useChatHistoryStore.getState()
    
    console.log('[Auto-save] saveSession called, currentSessionId:', currentSessionId, 'messages:', currentMessages.length)
    
    // Only require user to be logged in
    if (!user?.uid) {
      console.log('[Auto-save] Skipping save - user not logged in')
      return
    }

    // Use fallback values when FHIR data is not available
    const effectivePatientId = patientId || 'no-patient'
    const effectiveFhirServerUrl = fhirServerUrl || 'no-fhir-server'

    console.log('[Auto-save] Save context:', {
      hasUser: !!user?.uid,
      hasPatientId: !!patientId,
      hasFhirServerUrl: !!fhirServerUrl,
      effectivePatientId,
      effectiveFhirServerUrl,
    })

    if (currentMessages.length === 0) {
      console.log('[Auto-save] Skipping save - no messages')
      return
    }

    if (currentMessages.length === lastSavedMessageCountRef.current) {
      console.log('[Auto-save] Skipping save - message count unchanged:', currentMessages.length)
      return
    }

    if (isSavingRef.current) {
      console.log('[Auto-save] Skipping save - already saving')
      return
    }

    isSavingRef.current = true

    try {
      if (!currentSessionId) {
        console.log('[Auto-save] Creating new session')
        const newSession = await saveChatSessionUseCase.execute({
          userId: user.uid,
          fhirServerUrl: effectiveFhirServerUrl,
          patientId: effectivePatientId,
          messages: currentMessages,
          locale,
        })

        setCurrentSessionId(newSession.id)
        addSession({
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
        })

        console.log('[Auto-save] Created new session:', newSession.id)
      } else {
        console.log('[Auto-save] Updating existing session')
        await updateChatSessionUseCase.execute(currentSessionId, user.uid, {
          messages: currentMessages,
        })

        updateSession(currentSessionId, {
          updatedAt: new Date(),
          messageCount: currentMessages.length,
        })

        console.log('[Auto-save] Updated session:', currentSessionId)
      }

      lastSavedMessageCountRef.current = currentMessages.length
    } catch (error) {
      console.error('[Auto-save] Failed to save chat session:', error)
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
        console.log('[Auto-save] Skipped - streaming just started or in thinking state')
        return
      }
      // Check if message has agentStates (deep mode) - wait for completion
      if ('agentStates' in lastMessage && Array.isArray(lastMessage.agentStates) && lastMessage.agentStates.length > 0) {
        const lastState = lastMessage.agentStates[lastMessage.agentStates.length - 1]
        if (lastState?.state?.includes('🤔') || lastState?.state?.includes('思考中')) {
          console.log('[Auto-save] Skipped - agent still thinking')
          return
        }
      }
    }
    
    console.log('[Auto-save] Message count changed:', {
      enabled,
      messagesCount: messageCount,
      lastSavedCount: lastSavedMessageCountRef.current,
      hasUser: !!user?.uid,
      hasPatientId: !!patientId,
      hasFhirServerUrl: !!fhirServerUrl,
    })

    if (!enabled) {
      console.log('[Auto-save] Skipped - not enabled')
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (messageCount === 0) {
      console.log('[Auto-save] Skipped - no messages')
      return
    }

    if (messageCount === lastSavedMessageCountRef.current) {
      console.log('[Auto-save] Skipped - message count unchanged from last save')
      return
    }

    console.log(`[Auto-save] Scheduling save in ${debounceMs}ms...`)
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
    console.log('[Auto-save] forceSave called')
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
