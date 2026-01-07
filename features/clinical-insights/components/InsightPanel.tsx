// Insight Panel Component
import { useMemo, useRef, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChevronDown, Loader2, Square, Sparkles, Info, Pencil, Maximize2, Minimize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { InsightPanelProps } from '../types'

export function InsightPanel({
  panelId,
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
  modelMetadata,
  fallbackModelId,
  autoGenerate,
  isEditMode = false,
}: InsightPanelProps) {
  const { t } = useLanguage()
  const { updatePanel } = useClinicalInsightsConfig()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(title)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    setTitleValue(title)
  }, [title])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleAutoGenerateChange = (checked: boolean | string) => {
    updatePanel(panelId, { autoGenerate: checked as boolean })
  }

  const handleTitleSave = () => {
    const trimmedValue = titleValue.trim()
    if (trimmedValue && trimmedValue !== title) {
      updatePanel(panelId, { title: trimmedValue })
    } else {
      setTitleValue(title)
    }
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave()
    } else if (e.key === "Escape") {
      setTitleValue(title)
      setIsEditingTitle(false)
    }
  }
  
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

  // Handle escape key to close expanded mode
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false)
      }
    }
    
    if (isExpanded) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isExpanded])

  return (
    <>
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 pb-2 pt-3">
        <div className="space-y-1 flex-1">
          {!isEditingTitle ? (
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingTitle(true)}
                className="h-6 w-6 p-0"
                title="編輯標題"
              >
                <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
              </Button>
            </div>
          ) : (
            <Input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="h-7 px-2 py-0 text-sm font-semibold"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {t.clinicalInsights.model} {modelInfo.label} ({modelInfo.provider})
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            <Checkbox
              id={`auto-generate-${panelId}`}
              checked={autoGenerate}
              onCheckedChange={handleAutoGenerateChange}
              className="border-2 border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label
              htmlFor={`auto-generate-${panelId}`}
              className="text-xs font-medium cursor-pointer"
            >
              {t.clinicalInsights.autoGenerate || "Auto-generate"}
            </Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">
                    {t.clinicalInsights.autoGenerateTooltip || "When enabled, this insight will automatically generate when you enter the Clinical Insights page with patient data loaded."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
            <Sparkles className="h-3.5 w-3.5" />
            {t.clinicalInsights.generate}
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
              {/* Expand button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="absolute top-2 right-2 h-7 w-7 p-0 opacity-60 hover:opacity-100"
                title={t.common.maximize}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : hasData ? t.clinicalInsights.readyToGenerate : t.clinicalInsights.waitingForData}
            </span>
            <span>{response.length} {t.clinicalInsights.chars}</span>
          </div>
        </div>
      </CardContent>
    </Card>
    
    {/* Expanded overlay */}
    {isExpanded && (
      <div 
        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
        onClick={() => setIsExpanded(false)}
      >
        {/* Floating minimize button */}
        <button
          onClick={() => setIsExpanded(false)}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-md"
          title={t.common.minimize}
        >
          <Minimize2 className="h-5 w-5" />
        </button>
        
        {/* Title */}
        <div className="pt-4 px-6 text-center">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        
        <div 
          className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col min-h-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Textarea
            value={response}
            onChange={(event) => onResponseChange(event.target.value)}
            placeholder={t.clinicalInsights.responsePlaceholder}
            className="flex-1 resize-none text-sm overflow-y-auto"
            disabled={isLoading}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>
              {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : t.clinicalInsights.readyToGenerate}
            </span>
            <span>{response.length} {t.clinicalInsights.chars}</span>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
