// Chat Mode Selector Component
"use client"

import { Sparkles, MessageSquare } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-0.5 h-[42px] cursor-pointer w-[130px] shrink-0">
            {isAgentMode ? (
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : (
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="text-xs font-medium flex-1 leading-tight">
              {isAgentMode ? t.medicalChat.deepMode : t.medicalChat.normalMode}
            </span>
            <Switch 
              checked={isAgentMode} 
              onCheckedChange={onModeToggle}
              className="scale-75 data-[state=checked]:bg-primary shrink-0"
            />
          </div>
        </TooltipTrigger>
        {isAgentMode && (
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-semibold mb-1">
              {t.medicalChat.deepModeFeaturesTitle}
            </p>
            <p className="text-xs whitespace-pre-line">{t.medicalChat.deepModeFeatures}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
