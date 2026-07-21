import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useUpdateSessionMutation } from './use-chat-sessions-query.hook'
import { useFhirContext } from './use-fhir-context.hook'
import { getChatSessionRepository } from '@/src/application/composition.chat'
import {
  captureAiRuntimeConfig,
  createSmartTitleUseCase,
} from '@/src/application/composition.ai'

const repository = getChatSessionRepository()

export function useSmartTitleGeneration(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const { user } = useAuth()
  const { locale } = useLanguage()
  const { patientId, fhirServerUrl } = useFhirContext()
  const messages = useChatStore(state => state.messages)
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const setIsTitleGenerating = useChatHistoryStore(state => state.setIsTitleGenerating)
  const { updateSession } = useUpdateSessionMutation()
  const generatedSessionsRef = useRef<Set<string>>(new Set())
  const sessionIdForTitleRef = useRef<string | null>(null)
  const prevMessageCountRef = useRef<number>(0)
  const prevSessionIdRef = useRef<string | null>(null)

  // Reset message count when session changes
  useEffect(() => {
    if (!enabled) return
    if (currentSessionId !== prevSessionIdRef.current) {
      prevMessageCountRef.current = messages.length
      prevSessionIdRef.current = currentSessionId
    }
  }, [currentSessionId, enabled, messages.length])

  const generateSmartTitle = useCallback(async (
    sessionId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
    locale: string,
  ) => {
    try {
      setIsTitleGenerating(true)

      const useCase = createSmartTitleUseCase(captureAiRuntimeConfig())
      const smartTitle = await useCase.execute({
        userMessage,
        assistantMessage,
        locale,
      })

      // Give the existing auto-save a chance to create the Firestore document.
      await new Promise(resolve => setTimeout(resolve, 1000))

      const currentId = useChatHistoryStore.getState().currentSessionId
      if (currentId !== sessionId) {
        console.warn('[Smart Title] Session changed during generation, skipping update')
        return
      }

      try {
        await repository.updateTitle(sessionId, userId, smartTitle)
      } catch (firestoreError: any) {
        if (firestoreError?.code === 'not-found' || firestoreError?.message?.includes('No document to update')) {
          console.warn('[Smart Title] Document not yet saved, will update on next auto-save')
        } else {
          throw firestoreError
        }
      }

      if (patientId && fhirServerUrl) {
        updateSession(userId, patientId, fhirServerUrl, sessionId, { title: smartTitle })
      }
    } catch (error) {
      console.error('[Smart Title] Failed to generate or update title:', error)
    } finally {
      setIsTitleGenerating(false)
    }
  }, [fhirServerUrl, patientId, setIsTitleGenerating, updateSession])

  useEffect(() => {
    // Only generate title once per session
    if (!currentSessionId) return
    if (!user?.uid) return
    
    // Skip if already generated for this session
    if (generatedSessionsRef.current.has(currentSessionId)) return
    
    // IMPORTANT: Only generate when message count changes from 0 to 2
    // This prevents generating title when loading an existing 2-message session
    const isNewConversation = prevMessageCountRef.current === 0 && messages.length === 2
    if (!isNewConversation) {
      // Update count for next check
      prevMessageCountRef.current = messages.length
      return
    }
    
    // Update count
    prevMessageCountRef.current = messages.length
    
    const userMessage = messages.find(m => m.role === 'user')
    const assistantMessage = messages.find(m => m.role === 'assistant')
    
    if (!userMessage || !assistantMessage) return
    
    // Check if assistant message has content (streaming completed)
    if (!assistantMessage.content || assistantMessage.content.trim().length === 0) return
    
    // Mark this session as generated to prevent multiple calls
    generatedSessionsRef.current.add(currentSessionId)
    
    // Capture the session ID at the time of generation
    // This prevents generating title for wrong session if user switches during generation
    const capturedSessionId = currentSessionId
    sessionIdForTitleRef.current = capturedSessionId
    
    // Generate smart title in background
    generateSmartTitle(
      capturedSessionId,
      user.uid,
      userMessage.content,
      assistantMessage.content,
      locale,
    )
  }, [enabled, generateSmartTitle, messages, currentSessionId, user?.uid, locale])

  return {
    // Expose nothing for now, this hook works automatically
  }
}
