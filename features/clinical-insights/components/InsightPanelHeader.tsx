// Insight Panel Header Component
import { useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Check, Copy, Square, Sparkles, Trash2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"
import { markdownToPlainText } from "@/src/shared/utils/markdown-to-text"

interface InsightPanelHeaderProps {
  title: string
  fallbackModelId: string
  response: string
  isLoading: boolean
  canGenerate: boolean
  hasData: boolean
  autoGenerate?: boolean
  onToggleAutoGenerate?: (value: boolean) => void
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
  autoGenerate,
  onToggleAutoGenerate,
  onClearResponse,
  onRegenerate,
  onStopGeneration,
}: InsightPanelHeaderProps) {
  const { t } = useLanguage()
  const { copied, copy } = useCopyToClipboard()

  const handleCopy = async () => {
    const ok = await copy(markdownToPlainText(response))
    if (!ok) toast.error(t.common.copyFailed)
  }

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
      <div className="flex items-center gap-2">
        {response && !isLoading && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCopy}
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-muted-foreground"
                  aria-label={copied ? t.common.copied : t.common.copy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? t.common.copied : t.common.copy}</p>
              </TooltipContent>
            </Tooltip>
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
        {onToggleAutoGenerate && (
          <div className="flex items-center gap-1.5 mr-0.5">
            <Switch
              checked={!!autoGenerate}
              onCheckedChange={onToggleAutoGenerate}
              aria-label={t.clinicalInsights.autoGenerate}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap cursor-help">
                    {t.clinicalInsights.autoGenerate}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{t.clinicalInsights.autoGenerateTooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
