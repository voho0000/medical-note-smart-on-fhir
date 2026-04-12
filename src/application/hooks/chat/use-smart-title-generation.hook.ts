import { useEffect, useRef } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useUpdateSessionMutation } from './use-chat-sessions-query.hook'
import { useFhirContext } from './use-fhir-context.hook'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { GenerateSmartTitleUseCase } from '@/src/core/use-cases/chat/generate-smart-title.use-case'

const repository = new FirestoreChatSessionRepository()
const generateSmartTitleUseCase = new GenerateSmartTitleUseCase()

export function useSmartTitleGeneration() {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const { patientId, fhirServerUrl } = useFhirContext()
  const apiKey = useAiConfigStore(state => state.apiKey)
  const messages = useChatStore(state => state.messages)
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const setIsTitleGenerating = useChatHistoryStore(state => state.setIsTitleGenerating)
  const { updateSession } = useUpdateSessionMutation()
  const generatedSessionsRef = useRef<Set<string>>(new Set())
  const sessionIdForTitleRef = useRef<string | null>(null)

  useEffect(() => {
    // Only generate title once per session
    if (!currentSessionId) return
    if (!user?.uid) return
    
    // Skip if already generated for this session
    if (generatedSessionsRef.current.has(currentSessionId)) return
    
    // Check if this is the first complete conversation (1 user + 1 assistant message)
    if (messages.length !== 2) return
    
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
      apiKey
    )
  }, [messages, currentSessionId, user?.uid, locale, apiKey])

  const generateSmartTitle = async (
    sessionId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
    locale: string,
    apiKey: string | null
  ) => {
    try {
      // Set generating state to true
      setIsTitleGenerating(true)
      
      const smartTitle = await generateSmartTitleUseCase.execute({
        userMessage,
        assistantMessage,
        locale,
        apiKey,  // Pass decrypted API key from store
      })
      
      // Wait a bit to ensure auto-save has completed
      // This prevents "No document to update" error
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Verify we're still on the same session before updating
      // This prevents updating the wrong session if user switched during generation
      const currentId = useChatHistoryStore.getState().currentSessionId
      if (currentId !== sessionId) {
        console.warn('[Smart Title] Session changed during generation, skipping update')
        return
      }
      
      // Update Firestore - check if document exists first
      try {
        await repository.updateTitle(sessionId, userId, smartTitle)
      } catch (firestoreError: any) {
        // If document doesn't exist yet, just update React Query cache
        // The title will be saved when auto-save runs next time
        if (firestoreError?.code === 'not-found' || firestoreError?.message?.includes('No document to update')) {
          console.warn('[Smart Title] Document not yet saved, will update on next auto-save')
        } else {
          throw firestoreError
        }
      }
      
      // Update React Query cache for immediate UI update
      if (patientId && fhirServerUrl) {
        updateSession(userId, patientId, fhirServerUrl, sessionId, { title: smartTitle })
      }
    } catch (error) {
      console.error('[Smart Title] Failed to generate or update title:', error)
    } finally {
      // Always reset generating state
      setIsTitleGenerating(false)
    }
  }

  return {
    // Expose nothing for now, this hook works automatically
  }
}
