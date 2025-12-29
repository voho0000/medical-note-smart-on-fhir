// Model Selector Component
import { Label } from "@/components/ui/label"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition, ModelDefinition } from "@/src/shared/constants/ai-models.constants"

interface ModelSelectorProps {
  models: Array<{ id: string; label: string; description: string }>
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
        const definition = getModelDefinition(entry.id)
        const status = definition ? getModelStatus(definition) : ""
        
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelectModel(entry.id)}
            className={cn(
              "h-auto min-w-[140px] flex-1 rounded-md border px-3 py-2 text-left text-xs transition",
              isActive
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <span className="block text-sm font-medium leading-tight">{entry.label}</span>
            <span className="text-xs text-muted-foreground">
              {locale === 'zh-TW' && definition?.descriptionZh ? definition.descriptionZh : entry.description}
            </span>
            {status && (
              <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {status}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
