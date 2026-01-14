'use client'

import { useState } from 'react'
import { History, MessageSquare, Trash2, Clock, X, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useChatHistory } from "@/src/application/hooks/chat/use-chat-history.hook"
import { useChatSession } from "@/src/application/hooks/chat/use-chat-session.hook"
import { useFhirContext } from '@/src/application/hooks/chat/use-fhir-context.hook'
import { AuthDialog } from '@/features/auth/components/AuthDialog'
import type { ChatSessionMetadata } from "@/src/core/entities/chat-session.entity"

export function ChatHistoryDrawer() {
  const [open, setOpen] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const { t } = useLanguage()
  const { patientId, patientName, fhirServerUrl } = useFhirContext()
  const { user } = useAuth()
  const { sessions, isLoading, deleteSession } = useChatHistory(patientId || undefined, fhirServerUrl || undefined)
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
    
    if (!confirm(t.chatHistory?.confirmDelete || 'Delete this conversation?')) {
      return
    }

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

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t.chatHistory?.justNow || 'Just now'
    if (diffMins < 60) return `${diffMins}${t.chatHistory?.minutesAgo || 'm ago'}`
    if (diffHours < 24) return `${diffHours}${t.chatHistory?.hoursAgo || 'h ago'}`
    if (diffDays < 7) return `${diffDays}${t.chatHistory?.daysAgo || 'd ago'}`
    
    return date.toLocaleDateString()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">{t.chatHistory?.title || 'History'}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:w-[400px] p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t.chatHistory?.title || 'Chat History'}
          </SheetTitle>
          <SheetDescription>
            {patientName ? (
              <>
                {t.chatHistory?.conversationsFor || 'Conversations for'} <strong>{patientName}</strong>
              </>
            ) : (
              t.chatHistory?.description || 'View your previous conversations'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b bg-muted/30">
          <Button
            onClick={handleNewChat}
            className="w-full gap-2"
            size="sm"
          >
            <MessageSquare className="h-4 w-4" />
            {t.chatHistory?.newChat || 'New Chat'}
          </Button>
        </div>

        {!user ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-180px)] px-6 text-center">
            <LogIn className="h-16 w-16 text-muted-foreground/50 mb-6" />
            <h3 className="text-lg font-semibold mb-2">
              {t.chatHistory.loginRequired || "需要登入"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {t.chatHistory.loginPrompt || "請登入以使用對話紀錄功能。登入後，您的對話將自動儲存並可在不同裝置間同步。"}
            </p>
            <Button 
              onClick={() => setShowAuthDialog(true)}
              className="gap-2"
            >
              <LogIn className="h-4 w-4" />
              {t.auth.signIn}
            </Button>
            <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-180px)] px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">{t.common.loading}</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">{t.chatHistory.noHistory}</p>
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {sessions.map((session) => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    onLoad={handleLoadSession}
                    onDelete={handleDeleteSession}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}

interface ChatHistoryItemProps {
  session: ChatSessionMetadata
  onLoad: (sessionId: string) => void
  onDelete: (sessionId: string, e: React.MouseEvent) => void
  formatDate: (date: Date) => string
}

function ChatHistoryItem({ session, onLoad, onDelete, formatDate }: ChatHistoryItemProps) {
  return (
    <div
      className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div 
          className="flex-1 min-w-0"
          onClick={() => onLoad(session.id)}
        >
          <h4 className="font-medium text-sm line-clamp-2 mb-1">
            {session.title}
          </h4>
          {session.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {session.summary}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDate(session.updatedAt)}</span>
            <Badge variant="secondary" className="text-xs">
              {session.messageCount} {session.messageCount === 1 ? 'msg' : 'msgs'}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => onDelete(session.id, e)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
