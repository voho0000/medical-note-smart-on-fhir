// Insight Panel Component (Refactored)
import { useState } from "react"
import { useExpandable } from "@/src/shared/hooks/ui/use-expandable.hook"
import { useExpandedOverlay } from "@/src/shared/hooks/ui/use-expanded-overlay.hook"
import { Card, CardContent } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { ExpandedOverlay } from '@/src/shared/components/ExpandedOverlay'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'
import { InsightPanelHeader } from './InsightPanelHeader'
import { InsightPromptEditor } from './InsightPromptEditor'
import { InsightPromptExpandedOverlay } from './InsightPromptExpandedOverlay'
import { InsightResponseDisplay } from './InsightResponseDisplay'
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
  onClearResponse,
  isEdited,
  modelMetadata,
  fallbackModelId,
  autoGenerate,
  isEditMode = false,
}: InsightPanelProps) {
  const { t } = useLanguage()
  const { setActiveTab } = useRightPanel()
  const [isEditingResponse, setIsEditingResponse] = useState(false)
  
  // Expandable states using shared hook
  const responseExpandable = useExpandable()
  const promptExpandable = useExpandable()
  const { isExpanded } = responseExpandable
  const { isExpanded: isPromptExpanded } = promptExpandable

  // Handle escape key and body overflow for expanded overlays
  useExpandedOverlay({ isExpanded, onCollapse: responseExpandable.collapse })
  useExpandedOverlay({ isExpanded: isPromptExpanded, onCollapse: promptExpandable.collapse })

  const handleManageInsights = () => {
    setActiveTab('settings', 'insights')
  }

  // Response content for expanded overlay
  const responseContent = (
    <>
      {isEditingResponse || isLoading ? (
        <Textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          placeholder={t.clinicalInsights.responsePlaceholder}
          className="flex-1 resize-none text-sm overflow-y-auto"
          disabled={isLoading}
        />
      ) : (
        <div 
          className="flex-1 overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text"
          onClick={() => setIsEditingResponse(true)}
        >
          {response ? (
            <MarkdownRenderer content={response} />
          ) : (
            <span className="text-muted-foreground">{t.clinicalInsights.responsePlaceholder}</span>
          )}
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>
          {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : t.clinicalInsights.readyToGenerate}
        </span>
        <span>{response.length} {t.clinicalInsights.chars}</span>
      </div>
    </>
  )

  // Render expanded overlay or normal view
  if (isExpanded) {
    return (
      <ExpandedOverlay
        content={responseContent}
        onCollapse={responseExpandable.collapse}
        title={title}
      />
    )
  }

  return (
    <>
      <Card className={CARD_BORDER_CLASSES.insight}>
        <InsightPanelHeader
          title={title}
          fallbackModelId={fallbackModelId}
          response={response}
          isLoading={isLoading}
          canGenerate={canGenerate}
          hasData={hasData}
          onClearResponse={onClearResponse}
          onRegenerate={onRegenerate}
          onStopGeneration={onStopGeneration}
        />
        
        <CardContent className="space-y-2 pt-0">
          <InsightPromptEditor
            prompt={prompt}
            onPromptChange={onPromptChange}
            onExpand={promptExpandable.expand}
            onManageInsights={handleManageInsights}
          />
          
          <Separator className="opacity-50" />
          
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-muted-foreground">
              {t.clinicalInsights.response}
            </label>
            <InsightResponseDisplay
              response={response}
              isLoading={isLoading}
              isEditing={isEditingResponse}
              hasData={hasData}
              isEdited={isEdited}
              error={error}
              onResponseChange={onResponseChange}
              onExpand={responseExpandable.expand}
              onStartEditing={() => setIsEditingResponse(true)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {isLoading ? t.clinicalInsights.generating : isEdited ? t.clinicalInsights.edited : response ? t.clinicalInsights.generated : hasData ? t.clinicalInsights.readyToGenerate : t.clinicalInsights.waitingForData}
              </span>
              <span>{response.length} {t.clinicalInsights.chars}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Expanded overlay for prompt */}
      {isPromptExpanded && (
        <InsightPromptExpandedOverlay
          title={title}
          prompt={prompt}
          onPromptChange={onPromptChange}
          onCollapse={promptExpandable.collapse}
        />
      )}
    </>
  )
}
