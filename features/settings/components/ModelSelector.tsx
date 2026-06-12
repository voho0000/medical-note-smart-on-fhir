// Model Selector Component
import { Lock, Check } from "lucide-react"
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              "group h-full w-full rounded-lg border px-3 py-2.5 text-left transition relative",
              isLocked && "opacity-70 cursor-not-allowed border-border bg-background",
              !isLocked && isActive && "border-primary ring-1 ring-primary bg-primary/5 shadow-sm",
              !isLocked && !isActive && "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium leading-tight">{entry.label}</span>
                <span className="block mt-0.5 text-xs text-muted-foreground leading-snug">
                  {entry.description}
                </span>
              </div>
              {isLocked ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
              ) : isActive ? (
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              ) : null}
            </div>
          </button>
        )

        // Always show tooltip with status on hover
        return (
          <TooltipProvider key={entry.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                {button}
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {status || (locale === 'zh-TW' ? '可用' : 'Available')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
    </div>
  )
}
