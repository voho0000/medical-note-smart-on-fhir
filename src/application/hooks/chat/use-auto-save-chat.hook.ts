import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useAddSessionMutation, useUpdateSessionMutation } from './use-chat-sessions-query.hook'
import { getChatSessionRepository } from '@/src/application/composition.chat'
import { SaveChatSessionUseCase } from '@/src/core/use-cases/chat/save-chat-session.use-case'
import { UpdateChatSessionUseCase } from '@/src/core/use-cases/chat/update-chat-session.use-case'
import { logger } from '@/src/shared/services/logger.service'
import type { ChatMessage } from '@/src/core/entities/chat-message.entity'
import { createCoalescingSaveQueue } from '@/src/shared/utils/coalescing-save-queue'
import { useConnectivityStore } from '@/src/application/stores/connectivity.store'

const repository = getChatSessionRepository()
const saveChatSessionUseCase = new SaveChatSessionUseCase(repository)
const updateChatSessionUseCase = new UpdateChatSessionUseCase(repository)
const autoSaveLogger = logger.scope('Auto-save')

interface UseAutoSaveChatOptions {
  patientId?: string
  fhirServerUrl?: string
  debounceMs?: number
  enabled?: boolean
}

interface ChatSaveSnapshot {
  conversationKey: string
  revision: string
  sessionId: string | null
  userId: string
  patientId: string
  fhirServerUrl: string
  locale: string
  messages: ChatMessage[]
}

type ChatSaveQueue = ReturnType<typeof createCoalescingSaveQueue<ChatSaveSnapshot>>

function conversationKeyFor(messages: ChatMessage[]): string | null {
  return messages[0]?.id ?? null
}

function revisionFor(messages: ChatMessage[]): string {
  // Images are deliberately omitted because Firestore chat history never
  // stores them. Everything that can change in the persisted transcript stays
  // in this revision, including streamed assistant content and reply metadata.
  return JSON.stringify(messages.map((message) => [
    message.id,
    message.role,
    message.content,
    message.timestamp,
    message.modelId,
    message.agentStates,
    message.replyTo,
  ]))
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
  const userId = user?.uid
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const setCurrentSessionId = useChatHistoryStore(state => state.setCurrentSessionId)
  const { addSession } = useAddSessionMutation()
  const { updateSession } = useUpdateSessionMutation()
  const isSaving = useConnectivityStore((state) => state.chatSyncStatus === 'pending')
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const prevMessageCountRef = useRef(0)
  const lastSavedRevisionRef = useRef(new Map<string, string>())
  const sessionIdByConversationRef = useRef(new Map<string, string>())
  const persistSnapshotRef = useRef<(snapshot: ChatSaveSnapshot) => Promise<void>>(async () => {})
  const saveQueueRef = useRef<ChatSaveQueue | null>(null)
  const mountedRef = useRef(true)

  // Track last message content to detect when streaming completes
  const lastMessageContentRef = useRef<string>('')
  const isSessionChangingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Reset refs when session changes
  useEffect(() => {
    // Set flag to skip auto-save during session change
    isSessionChangingRef.current = true
    
    // Set to current message count to avoid triggering save when just loading a session
    const currentMessages = useChatStore.getState().messages
    prevMessageCountRef.current = currentMessages.length
    const conversationKey = conversationKeyFor(currentMessages)
    if (conversationKey && currentSessionId) {
      sessionIdByConversationRef.current.set(conversationKey, currentSessionId)
    }
    // Also update content ref to current state
    const lastMessage = currentMessages[currentMessages.length - 1]
    lastMessageContentRef.current = lastMessage?.content || ''
    
    // Reset flag after a short delay to allow effects to settle
    const timer = setTimeout(() => {
      isSessionChangingRef.current = false
    }, 100)
    
    return () => clearTimeout(timer)
  }, [currentSessionId])

  const persistSnapshot = useCallback(async (snapshot: ChatSaveSnapshot) => {
    const knownSessionId = snapshot.sessionId
      || sessionIdByConversationRef.current.get(snapshot.conversationKey)

    if (!knownSessionId) {
      const newSession = await saveChatSessionUseCase.execute({
        userId: snapshot.userId,
        fhirServerUrl: snapshot.fhirServerUrl,
        patientId: snapshot.patientId,
        messages: snapshot.messages,
        locale: snapshot.locale,
      })

      sessionIdByConversationRef.current.set(snapshot.conversationKey, newSession.id)
      if (mountedRef.current) {
        const liveMessages = useChatStore.getState().messages
        const liveSessionId = useChatHistoryStore.getState().currentSessionId
        if (conversationKeyFor(liveMessages) === snapshot.conversationKey && !liveSessionId) {
          setCurrentSessionId(newSession.id)
        }
        addSession(
          snapshot.userId,
          snapshot.patientId,
          snapshot.fhirServerUrl,
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
          },
        )
      }
    } else {
      await updateChatSessionUseCase.execute(knownSessionId, snapshot.userId, {
        messages: snapshot.messages,
      })

      if (mountedRef.current) {
        updateSession(
          snapshot.userId,
          snapshot.patientId,
          snapshot.fhirServerUrl,
          knownSessionId,
          { messageCount: snapshot.messages.length },
        )
      }
    }

    lastSavedRevisionRef.current.set(snapshot.conversationKey, snapshot.revision)
    useConnectivityStore.getState().setFirestoreConnection('server')
  }, [addSession, setCurrentSessionId, updateSession])

  useEffect(() => {
    persistSnapshotRef.current = persistSnapshot
    if (!saveQueueRef.current) {
      saveQueueRef.current = createCoalescingSaveQueue<ChatSaveSnapshot>({
        save: (snapshot) => persistSnapshotRef.current(snapshot),
        onStatusChange: (status) => {
          useConnectivityStore.getState().setChatSyncStatus(status)
        },
        onError: (error) => {
          autoSaveLogger.error('Failed to save chat session', error)
        },
      })
    }
  }, [persistSnapshot])

  const saveSession = useCallback(async (force: boolean = false) => {
    // Custom hospital-model mode disables cloud history. forceSave must honor
    // the same gate; otherwise send/completion callbacks would still upload the
    // conversation even though the debounced effect was disabled.
    if (!enabled) return
    // Get fresh messages from store to avoid closure issues
    const { messages: currentMessages, isTemporaryMode } = useChatStore.getState()
    const { currentSessionId } = useChatHistoryStore.getState()

    // Only require user to be logged in
    if (!userId) {
      return
    }

    // Temporary / incognito chat — never persist to Firestore.
    if (isTemporaryMode) {
      return
    }

    // Use fallback values when FHIR data is not available
    const effectivePatientId = patientId || 'no-patient'
    const effectiveFhirServerUrl = fhirServerUrl || 'no-fhir-server'

    if (currentMessages.length === 0) {
      return
    }

    const conversationKey = conversationKeyFor(currentMessages)
    if (!conversationKey) return
    const revision = revisionFor(currentMessages)

    if (!force && lastSavedRevisionRef.current.get(conversationKey) === revision) {
      return
    }

    saveQueueRef.current?.enqueue(conversationKey, {
      conversationKey,
      revision,
      sessionId: currentSessionId
        || sessionIdByConversationRef.current.get(conversationKey)
        || null,
      userId,
      patientId: effectivePatientId,
      fhirServerUrl: effectiveFhirServerUrl,
      locale,
      messages: currentMessages,
    })
  }, [
    userId,
    patientId,
    fhirServerUrl,
    locale,
    enabled,
  ])
  
  useEffect(() => {
    // Skip if session is changing (loading a session)
    if (isSessionChangingRef.current) {
      return
    }
    
    const messageCount = messages.length
    const lastMessage = messages[messages.length - 1]
    const lastMessageContent = lastMessage?.content || ''
    
    // Check if this is a meaningful change (count changed OR content changed from thinking state)
    const countChanged = messageCount !== prevMessageCountRef.current
    const contentChanged = lastMessageContent !== lastMessageContentRef.current
    
    // Check thinking state BEFORE updating ref
    const wasThinking = lastMessageContentRef.current.includes('🤔') || lastMessageContentRef.current.includes('思考中') || lastMessageContentRef.current.includes('🔍') || lastMessageContentRef.current.includes('📝')
    const isNowThinking = lastMessageContent.includes('🤔') || lastMessageContent.includes('思考中') || lastMessageContent.includes('🔍') || lastMessageContent.includes('📝')
    const justFinishedThinking = wasThinking && !isNowThinking && contentChanged
    
    // Check if message has agentStates (deep mode) - wait for completion
    let hasActiveAgentState = false
    if (lastMessage && lastMessage.role === 'assistant' && 'agentStates' in lastMessage && Array.isArray(lastMessage.agentStates) && lastMessage.agentStates.length > 0) {
      const lastState = lastMessage.agentStates[lastMessage.agentStates.length - 1]
      hasActiveAgentState = lastState?.state?.includes('🤔') || lastState?.state?.includes('思考中') || false
    }
    
    // Update refs AFTER checking thinking state
    lastMessageContentRef.current = lastMessageContent
    
    // Skip if nothing meaningful changed
    if (!countChanged && !justFinishedThinking) {
      return
    }
    
    prevMessageCountRef.current = messageCount
    
    // Skip if last message is empty or still in thinking state (streaming just started or incomplete)
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content.trim()
      // Check if message is empty or still showing thinking state
      if (!content || isNowThinking || hasActiveAgentState) {
        return
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

    saveTimeoutRef.current = setTimeout(() => {
      void saveSession()
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
    await saveSession(true)
  }, [saveSession])

  return {
    forceSave,
    isSaving,
  }
}
