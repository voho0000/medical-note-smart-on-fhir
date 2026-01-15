// Chat History Drawer State Management Hook
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatHistory } from '@/src/application/hooks/chat/use-chat-history.hook'
import { useChatSession } from '@/src/application/hooks/chat/use-chat-session.hook'

export function useChatHistoryDrawer(patientId?: string, fhirServerUrl?: string) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const { sessions, isLoading, deleteSession } = useChatHistory(patientId, fhirServerUrl)
  const { loadSession, startNewSession } = useChatSession()

  const handleLoadSession = async (sessionId: string) => {
    try {
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

  const handleNewChat = () => {
    startNewSession()
    setOpen(false)
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
