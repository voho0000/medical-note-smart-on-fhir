// Chat Mode Selector Component
"use client"

import { Sparkles, MessageSquare, AlertCircle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"

interface ChatModeSelectorProps {
  isAgentMode: boolean
  showApiKeyWarning: boolean
  onModeToggle: (enabled: boolean) => void
}

export function ChatModeSelector({ 
  isAgentMode, 
  showApiKeyWarning, 
  onModeToggle 
}: ChatModeSelectorProps) {
  const { t } = useLanguage()

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onModeToggle(false)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
              !isAgentMode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t.medicalChat.normalMode}
          </button>
          <button
            type="button"
            onClick={() => onModeToggle(true)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
              isAgentMode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.medicalChat.deepMode}
          </button>
        </div>
        {isAgentMode && (
          <span className="text-[10px] text-muted-foreground/60">
            {t.medicalChat.agentModeDescription}
          </span>
        )}
      </div>
      {showApiKeyWarning && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-amber-800 dark:text-amber-200">
            <div className="font-medium mb-1">{t.medicalChat.apiKeyWarningTitle}</div>
            <div className="text-amber-700 dark:text-amber-300">{t.medicalChat.apiKeyWarningMessage}</div>
          </div>
        </div>
      )}
    </>
  )
}
