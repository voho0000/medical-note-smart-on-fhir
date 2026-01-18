// Chat History Item Component
import { Clock, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useIsTitleGenerating, useCurrentSessionId } from '@/src/application/stores/chat-history.store'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

interface ChatHistoryItemProps {
  session: ChatSessionMetadata
  onLoad: (sessionId: string) => void
  onDelete: (sessionId: string, e: React.MouseEvent) => void
  formatDate: (date: Date) => string
  locale?: string
}

export function ChatHistoryItem({ session, onLoad, onDelete, formatDate, locale = 'en' }: ChatHistoryItemProps) {
  const isTitleGenerating = useIsTitleGenerating()
  const currentSessionId = useCurrentSessionId()
  
  // Check if this is the current session and title is being generated
  const isGeneratingThisTitle = isTitleGenerating && currentSessionId === session.id
  
  // Determine if this is a default title (not yet generated)
  const isDefaultTitle = session.title === 'New Conversation' || session.title === '新對話'
  
  return (
    <div className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors group cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div 
          className="flex-1 min-w-0"
          onClick={() => onLoad(session.id)}
        >
          <h4 className="font-medium text-sm line-clamp-2 mb-1 flex items-center gap-2">
            {isGeneratingThisTitle ? (
              <>
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                <span className="text-muted-foreground italic">
                  {locale === 'zh-TW' ? '生成標題中...' : 'Generating title...'}
                </span>
              </>
            ) : (
              <>
                {isDefaultTitle && currentSessionId === session.id && (
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
                {session.title}
              </>
            )}
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
