// Model Selector Component
import { Lock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition, ModelDefinition } from "@/src/shared/constants/ai-models.constants"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ModelSelectorProps {
  models: Array<{ id: string; label: string; description: string; isLocked?: boolean }>
  selectedModel: string
  onSelectModel: (modelId: string) => void
  getModelStatus: (definition: ModelDefinition) => string
}

export function ModelSelector({ models, selectedModel, onSelectModel, getModelStatus }: ModelSelectorProps) {
  const { locale } = useLanguage()
  
  return (
    <div className="flex flex-wrap gap-2">
      {models.map((entry) => {
        const isActive = selectedModel === entry.id
        const isLocked = entry.isLocked || false
        const definition = getModelDefinition(entry.id)
        const status = definition ? getModelStatus(definition) : ""
        
        const button = (
          <button
            key={entry.id}
            type="button"
            onClick={() => !isLocked && onSelectModel(entry.id)}
            disabled={isLocked}
            className={cn(
              "h-auto min-w-[140px] flex-1 rounded-md border px-3 py-2 text-left text-xs transition relative",
              isLocked && "opacity-60 cursor-not-allowed",
              !isLocked && isActive && "border-primary bg-primary/5 shadow-sm",
              !isLocked && !isActive && "border-border bg-background hover:border-primary/40",
              isLocked && "border-border bg-background",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <span className="block text-sm font-medium leading-tight">{entry.label}</span>
                <span className="text-xs text-muted-foreground">
                  {locale === 'zh-TW' && definition?.descriptionZh ? definition.descriptionZh : entry.description}
                </span>
                {status && (
                  <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {status}
                  </span>
                )}
              </div>
              {isLocked && (
                <Lock className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              )}
            </div>
          </button>
        )

        if (isLocked) {
          return (
            <TooltipProvider key={entry.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {button}
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {definition?.provider === 'openai' 
                      ? locale === 'zh-TW' ? '需要 OpenAI API 金鑰' : 'Requires OpenAI API key'
                      : locale === 'zh-TW' ? '需要 Gemini API 金鑰' : 'Requires Gemini API key'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        return button
      })}
    </div>
  )
}
