// Chat History Drawer Component - Refactored
'use client'

import { useState, useMemo } from 'react'
import { History, MessageSquare, LogIn, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useFhirContext } from '@/src/application/hooks/chat/use-fhir-context.hook'
import { AuthDialog } from '@/features/auth/components/AuthDialog'
import { useChatHistoryDrawer } from '../hooks/useChatHistoryDrawer'
import { ChatHistoryItem } from './ChatHistoryItem'
import { LoginPrompt } from './LoginPrompt'
import { EmptyState } from './EmptyState'
import { formatRelativeDate } from '../utils/date-formatter'

export function ChatHistoryDrawer() {
  const { t, locale } = useLanguage()
  const { patientId, patientName, fhirServerUrl } = useFhirContext()
  const { user } = useAuth()
  
  const {
    open,
    setOpen,
    showAuthDialog,
    setShowAuthDialog,
    showStreamingConfirm,
    sessions,
    isLoading,
    handleLoadSession,
    handleDeleteSession,
    pendingDeleteId,
    confirmDeleteSession,
    cancelDeleteSession,
    handleNewChat,
    handleOpenAuthDialog,
    handleConfirmSwitch,
    handleCancelSwitch,
  } = useChatHistoryDrawer(patientId || undefined, fhirServerUrl || undefined)

  const [query, setQuery] = useState('')
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.summary || '').toLowerCase().includes(q)
    )
  }, [sessions, query])

  const formatDate = (date: Date) => {
    return formatRelativeDate(date, {
      justNow: t.chatHistory?.justNow || 'Just now',
      minutesAgo: t.chatHistory?.minutesAgo || 'm ago',
      hoursAgo: t.chatHistory?.hoursAgo || 'h ago',
      daysAgo: t.chatHistory?.daysAgo || 'd ago',
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Trigger label flips to a sign-in CTA when signed out — keeps
            discoverability ("oh, I could save these") without hiding the
            entry point entirely. Clicking still opens the drawer, which
            shows the full LoginPrompt explaining what sign-in unlocks. */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          {user ? (
            <>
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.chatHistory?.title || 'History'}</span>
            </>
          ) : (
            <>
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {(t.chatHistory as any)?.signInToSave || 'Sign in to save chats'}
              </span>
            </>
          )}
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
          <Button onClick={handleNewChat} className="w-full gap-2" size="sm">
            <MessageSquare className="h-4 w-4" />
            {t.chatHistory?.newChat || 'New Chat'}
          </Button>
        </div>

        {!user ? (
          <>
            <LoginPrompt
              title={t.chatHistory.loginRequired || "需要登入"}
              description={t.chatHistory.loginPrompt || "請登入以使用對話紀錄功能。登入後，您的對話將自動儲存並可在不同裝置間同步。"}
              buttonLabel={t.auth.signIn}
              onLogin={handleOpenAuthDialog}
            />
            <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
          </>
        ) : (
          <>
            {sessions.length > 0 && (
              <div className="px-6 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.chatHistory.searchPlaceholder}
                    className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={t.common.close}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {query.trim() && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {locale === 'zh-TW'
                      ? `顯示 ${filteredSessions.length} / 共 ${sessions.length}`
                      : `Showing ${filteredSessions.length} of ${sessions.length}`}
                  </p>
                )}
              </div>
            )}
            <ScrollArea className="h-[calc(100vh-240px)] px-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">{t.common.loading}</p>
                </div>
              ) : sessions.length === 0 ? (
                <EmptyState message={t.chatHistory.noHistory} />
              ) : filteredSessions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t.chatHistory.searchNoMatch}
                </div>
              ) : (
                <div className="space-y-2 pb-4">
                  {filteredSessions.map((session) => (
                    <ChatHistoryItem
                      key={session.id}
                      session={session}
                      onLoad={handleLoadSession}
                      onDelete={handleDeleteSession}
                      formatDate={formatDate}
                      locale={locale}
                      query={query}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </SheetContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(next) => { if (!next) cancelDeleteSession() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chatHistory.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.chatHistory.deleteConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteSession}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Streaming Confirmation Dialog */}
      <AlertDialog open={showStreamingConfirm} onOpenChange={handleCancelSwitch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chatHistory.switchWhileStreamingTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.chatHistory.switchWhileStreamingDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.chatHistory.switchWhileStreamingCancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.chatHistory.switchWhileStreamingConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
