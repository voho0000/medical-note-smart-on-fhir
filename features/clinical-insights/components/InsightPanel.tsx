// Insight Panel Component
import { useMemo, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Loader2, RefreshCcw, Square, Sparkles } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { InsightPanelProps } from '../types'

export function InsightPanel({
  title,
  subtitle,
  prompt,
  onPromptChange,
  onRegenerate,
  onStopGeneration,
  isLoading,
  response,
  error,
  canGenerate,
  hasData,
  onResponseChange,
  isEdited,
  fallbackModelId,
}: InsightPanelProps) {
  const { t } = useLanguage()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const modelInfo = useMemo(() => {
    const definition = getModelDefinition(fallbackModelId)
    return {
      label: definition?.label ?? fallbackModelId,
      provider: (definition?.provider ?? "openai").toUpperCase(),
    }
  }, [fallbackModelId])

  // Auto-scroll to bottom when response changes during loading (streaming)
  useEffect(() => {
    if (isLoading && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [response, isLoading])

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
            {response ? <RefreshCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {response ? t.clinicalInsights.regenerate : t.clinicalInsights.generate}
          </Button>
        )}
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
          {!hasData ? (
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-200">
              <div className="flex items-start gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-1">{t.clinicalInsights.waitingForDataTitle}</div>
                  <div className="text-blue-700 dark:text-blue-300 text-xs">{t.clinicalInsights.waitingForDataMessage}</div>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          ) : (
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={response}
                onChange={(event) => onResponseChange(event.target.value)}
                placeholder={t.clinicalInsights.responsePlaceholder}
                className="min-h-[220px] max-h-[400px] resize-none text-sm overflow-y-auto"
                disabled={isLoading}
              />
              {isLoading && !response && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px] rounded-md pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs font-medium">{t.clinicalInsights.generating}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : !hasData ? t.clinicalInsights.waitingForData : t.clinicalInsights.readyToGenerate}
            </span>
            <span>{response.length} {t.clinicalInsights.chars}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
