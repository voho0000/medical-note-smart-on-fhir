// Insight Panel Header Component
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Loader2, Square, Sparkles, Trash2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

interface InsightPanelHeaderProps {
  title: string
  fallbackModelId: string
  response: string
  isLoading: boolean
  canGenerate: boolean
  hasData: boolean
  onClearResponse: () => void
  onRegenerate: () => void
  onStopGeneration: () => void
}

export function InsightPanelHeader({
  title,
  fallbackModelId,
  response,
  isLoading,
  canGenerate,
  hasData,
  onClearResponse,
  onRegenerate,
  onStopGeneration,
}: InsightPanelHeaderProps) {
  const { t } = useLanguage()
  
  const modelInfo = useMemo(() => {
    const definition = getModelDefinition(fallbackModelId)
    return {
      label: definition?.label ?? fallbackModelId,
      provider: (definition?.provider ?? "openai").toUpperCase(),
    }
  }, [fallbackModelId])

  return (
    <CardHeader className="flex items-start justify-between gap-3 pb-2 pt-3">
      <div className="space-y-1 flex-1">
        <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t.clinicalInsights.model} {modelInfo.label} ({modelInfo.provider})
        </p>
      </div>
      <div className="flex gap-2">
        {response && !isLoading && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onClearResponse}
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t.common.delete || "清除回應"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isLoading ? (
          <Button
            onClick={onStopGeneration}
            size="sm"
            variant="secondary"
            className="gap-1"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            {t.common.stop}
          </Button>
        ) : (
          <Button
            onClick={onRegenerate}
            size="sm"
            disabled={!canGenerate || !hasData}
            variant="outline"
            className="gap-1"
            title={!hasData ? t.clinicalInsights.waitingForData : undefined}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.clinicalInsights.generate}
          </Button>
        )}
      </div>
    </CardHeader>
  )
}
