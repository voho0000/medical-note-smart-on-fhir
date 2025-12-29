// Insight Panel Component
import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Loader2, RefreshCcw } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { InsightPanelProps } from '../types'

export function InsightPanel({
  title,
  subtitle,
  prompt,
  onPromptChange,
  onRegenerate,
  isLoading,
  response,
  error,
  canGenerate,
  onResponseChange,
  isEdited,
  fallbackModelId,
}: InsightPanelProps) {
  const { t } = useLanguage()
  const modelInfo = useMemo(() => {
    const definition = getModelDefinition(fallbackModelId)
    return {
      label: definition?.label ?? fallbackModelId,
      provider: (definition?.provider ?? "openai").toUpperCase(),
    }
  }, [fallbackModelId])

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 pb-2 pt-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          <p className="text-xs text-muted-foreground">
            {t.clinicalInsights.model} {modelInfo.label} ({modelInfo.provider})
          </p>
        </div>
        <Button
          onClick={onRegenerate}
          size="sm"
          disabled={isLoading || !canGenerate}
          variant="outline"
          className="gap-1"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          {isLoading ? t.clinicalInsights.running : t.clinicalInsights.regenerate}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Collapsible defaultOpen={false} className="space-y-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between px-2 text-xs font-medium">
              <span>{t.clinicalInsights.editPrompt}</span>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            <Textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              className="min-h-[88px] resize-vertical text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t.clinicalInsights.promptHelp}
            </p>
          </CollapsibleContent>
        </Collapsible>
        <Separator className="opacity-50" />
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase text-muted-foreground">{t.clinicalInsights.response}</label>
          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          ) : (
            <Textarea
              value={response}
              onChange={(event) => onResponseChange(event.target.value)}
              placeholder={t.clinicalInsights.responsePlaceholder}
              className="min-h-[220px] resize-vertical text-sm"
              disabled={isLoading}
            />
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : t.clinicalInsights.awaitingGeneration}
            </span>
            <span>{response.length} {t.clinicalInsights.chars}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
