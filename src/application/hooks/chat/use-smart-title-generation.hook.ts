import { useEffect, useRef } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { GenerateSmartTitleUseCase } from '@/src/core/use-cases/chat/generate-smart-title.use-case'

const repository = new FirestoreChatSessionRepository()
const generateSmartTitleUseCase = new GenerateSmartTitleUseCase()

export function useSmartTitleGeneration() {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const apiKey = useAiConfigStore(state => state.apiKey)  // Get decrypted API key from store
  const messages = useChatStore(state => state.messages)
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const updateSession = useChatHistoryStore(state => state.updateSession)
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
      console.log('[Smart Title] Generating AI title for session:', sessionId)
      
      const smartTitle = await generateSmartTitleUseCase.execute({
        userMessage,
        assistantMessage,
        locale,
        apiKey,  // Pass decrypted API key from store
      })
      
      console.log('[Smart Title] Generated title:', smartTitle)
      
      // Update Firestore
      await repository.updateTitle(sessionId, userId, smartTitle)
      
      // Update Zustand store for immediate UI update
      updateSession(sessionId, { title: smartTitle })
      
      console.log('[Smart Title] Title updated successfully')
    } catch (error) {
      console.error('[Smart Title] Failed to generate or update title:', error)
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
