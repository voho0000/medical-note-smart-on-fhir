// Chat History Drawer State Management Hook
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatHistory } from '@/src/application/hooks/chat/use-chat-history.hook'
import { useChatSession } from '@/src/application/hooks/chat/use-chat-session.hook'
import { useAutoSaveChat } from '@/src/application/hooks/chat/use-auto-save-chat.hook'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useChatStore } from '@/src/application/stores/chat.store'

export function useChatHistoryDrawer(patientId?: string, fhirServerUrl?: string) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showStreamingConfirm, setShowStreamingConfirm] = useState(false)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const { sessions, isLoading, deleteSession } = useChatHistory(patientId, fhirServerUrl)
  const { loadSession, startNewSession } = useChatSession()
  const { forceSave } = useAutoSaveChat({ patientId, fhirServerUrl })
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const messages = useChatStore(state => state.messages)

  // Check if there's an active streaming (last message is from assistant and might be incomplete)
  const hasCurrentSessionStreaming = () => {
    if (messages.length === 0) return false
    const lastMessage = messages[messages.length - 1]
    // Check if last message is from assistant and has minimal content (likely still streaming)
    return lastMessage.role === 'assistant' && lastMessage.content.length < 50
  }

  const handleLoadSession = async (sessionId: string) => {
    // Only check if CURRENT session has active streaming
    if (hasCurrentSessionStreaming()) {
      // Show confirmation dialog
      setPendingSessionId(sessionId)
      setShowStreamingConfirm(true)
      return
    }
    
    // No active streaming in current session, proceed directly
    await performLoadSession(sessionId)
  }

  const performLoadSession = async (sessionId: string) => {
    try {
      // Force save current session before switching
      await forceSave()
      
      await loadSession(sessionId)
      setOpen(false)
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleConfirmSwitch = async () => {
    setShowStreamingConfirm(false)
    if (pendingSessionId === '__new_chat__') {
      await performNewChat()
    } else if (pendingSessionId) {
      await performLoadSession(pendingSessionId)
    }
    setPendingSessionId(null)
  }

  const handleCancelSwitch = () => {
    setShowStreamingConfirm(false)
    setPendingSessionId(null)
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      await deleteSession(sessionId)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleNewChat = async () => {
    // Only check if CURRENT session has active streaming
    if (hasCurrentSessionStreaming()) {
      // Show confirmation dialog with special flag for new chat
      setPendingSessionId('__new_chat__')
      setShowStreamingConfirm(true)
      return
    }
    
    // No active streaming in current session, proceed directly
    await performNewChat()
  }

  const performNewChat = async () => {
    try {
      // Force save current session before starting new chat
      await forceSave()
      
      startNewSession()
      setOpen(false)
    } catch (error) {
      console.error('Failed to save before new chat:', error)
      // Still allow new chat even if save fails
      startNewSession()
      setOpen(false)
    }
  }

  const handleOpenAuthDialog = () => {
    setShowAuthDialog(true)
  }

  return {
    open,
    setOpen,
    showAuthDialog,
    setShowAuthDialog,
    showStreamingConfirm,
    sessions,
    isLoading,
    handleLoadSession,
    handleDeleteSession,
    handleNewChat,
    handleOpenAuthDialog,
    handleConfirmSwitch,
    handleCancelSwitch,
  }
}
