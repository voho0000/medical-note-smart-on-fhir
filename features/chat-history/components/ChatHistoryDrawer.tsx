// Chat History Drawer Component - Refactored
'use client'

import { History, MessageSquare } from 'lucide-react'
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
    handleNewChat,
    handleOpenAuthDialog,
    handleConfirmSwitch,
    handleCancelSwitch,
  } = useChatHistoryDrawer(patientId || undefined, fhirServerUrl || undefined)

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
        <Button variant="outline" size="sm" className="gap-2">
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
          <ScrollArea className="h-[calc(100vh-180px)] px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">{t.common.loading}</p>
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState message={t.chatHistory.noHistory} />
            ) : (
              <div className="space-y-2 pb-4">
                {sessions.map((session) => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    onLoad={handleLoadSession}
                    onDelete={handleDeleteSession}
                    formatDate={formatDate}
                    locale={locale}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>

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
