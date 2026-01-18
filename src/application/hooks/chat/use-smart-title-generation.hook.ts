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
  const hasGeneratedRef = useRef(false)

  useEffect(() => {
    // Only generate title once for the first conversation
    if (hasGeneratedRef.current) return
    if (!currentSessionId) return
    if (!user?.uid) return
    
    // Check if this is the first complete conversation (1 user + 1 assistant message)
    if (messages.length !== 2) return
    
    const userMessage = messages.find(m => m.role === 'user')
    const assistantMessage = messages.find(m => m.role === 'assistant')
    
    if (!userMessage || !assistantMessage) return
    
    // Check if assistant message has content (streaming completed)
    if (!assistantMessage.content || assistantMessage.content.trim().length === 0) return
    
    // Mark as generated to prevent multiple calls
    hasGeneratedRef.current = true
    
    // Generate smart title in background
    generateSmartTitle(
      currentSessionId,
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

  // Reset when session changes
  useEffect(() => {
    hasGeneratedRef.current = false
  }, [currentSessionId])

  return {
    // Expose nothing for now, this hook works automatically
  }
}
