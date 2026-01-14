// Insight Response Display Component
import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Maximize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'

interface InsightResponseDisplayProps {
  response: string
  isLoading: boolean
  isEditing: boolean
  hasData: boolean
  isEdited: boolean
  error?: { message: string } | null
  onResponseChange: (value: string) => void
  onExpand: () => void
  onStartEditing: () => void
}

export function InsightResponseDisplay({
  response,
  isLoading,
  isEditing,
  hasData,
  isEdited,
  error,
  onResponseChange,
  onExpand,
  onStartEditing,
}: InsightResponseDisplayProps) {
  const { t } = useLanguage()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when response changes during loading (streaming)
  useEffect(() => {
    if (isLoading && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [response, isLoading])

  if (!hasData) {
    return (
      <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
          <div>
            <div className="font-medium mb-1">{t.clinicalInsights.waitingForDataTitle}</div>
            <div className="text-blue-700 dark:text-blue-300 text-xs">{t.clinicalInsights.waitingForDataMessage}</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </div>
    )
  }

  return (
    <div className="relative">
      {isEditing || isLoading ? (
        <Textarea
          ref={textareaRef}
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          placeholder={t.clinicalInsights.responsePlaceholder}
          className="min-h-[220px] max-h-[400px] resize-none text-sm overflow-y-auto"
          disabled={isLoading}
        />
      ) : (
        <div 
          className="min-h-[220px] max-h-[400px] overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text"
          onClick={onStartEditing}
        >
          {response ? (
            <MarkdownRenderer content={response} />
          ) : (
            <span className="text-muted-foreground">{t.clinicalInsights.responsePlaceholder}</span>
          )}
        </div>
      )}
      {isLoading && !response && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px] rounded-md pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs font-medium">{t.clinicalInsights.generating}</span>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onExpand}
        className="absolute top-2 right-2 h-7 w-7 p-0 opacity-60 hover:opacity-100"
        title={t.common.maximize}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
