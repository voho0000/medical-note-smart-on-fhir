// Chat History Drawer State Management Hook
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatHistory } from '@/src/application/hooks/chat/use-chat-history.hook'
import { useChatSession } from '@/src/application/hooks/chat/use-chat-session.hook'
import { useAutoSaveChat } from '@/src/application/hooks/chat/use-auto-save-chat.hook'

export function useChatHistoryDrawer(patientId?: string, fhirServerUrl?: string) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const { sessions, isLoading, deleteSession } = useChatHistory(patientId, fhirServerUrl)
  const { loadSession, startNewSession } = useChatSession()
  const { forceSave } = useAutoSaveChat({ patientId, fhirServerUrl })

  const handleLoadSession = async (sessionId: string) => {
    try {
      // Force save current session before switching
      await forceSave()
      await loadSession(sessionId)
      setOpen(false)
    } catch (error) {
      console.error('Failed to load session:', error)
    }
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
    sessions,
    isLoading,
    handleLoadSession,
    handleDeleteSession,
    handleNewChat,
    handleOpenAuthDialog,
  }
}
