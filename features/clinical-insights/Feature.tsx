// Refactored Clinical Insights Feature
"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"

import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useAiQuery } from "@/src/application/hooks/use-ai-query.hook"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { useNote } from "@/src/application/providers/note.provider"
import { hasChatProxy } from "@/src/shared/config/env.config"

import { useInsightPanels } from './hooks/useInsightPanels'
import { useInsightGeneration } from './hooks/useInsightGeneration'
import { useAutoGenerate } from './hooks/useAutoGenerate'
import { InsightPanel } from './components/InsightPanel'
import { ApiKeyWarning } from './components/ApiKeyWarning'

export default function ClinicalInsightsFeature() {
  const { t } = useLanguage()
  const { panels, autoGenerate } = useClinicalInsightsConfig()
  const { apiKey: openAiKey, geminiKey } = useApiKey()
  const { getFullClinicalContext } = useClinicalContext()
  const { model } = useNote()
  const { queryAi } = useAiQuery(openAiKey, geminiKey)

  const [context, setContext] = useState("")

  const {
    prompts,
    responses,
    panelStatus,
    setResponses,
    setPanelStatus,
    handlePromptChange,
    handleResponseChange,
    resetEditedFlags,
  } = useInsightPanels(panels)

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(openAiKey || geminiKey) || canUseProxy

  const { runPanel } = useInsightGeneration({
    panels,
    prompts,
    responses,
    context,
    openAiKey,
    geminiKey,
    canUseProxy,
    model,
    queryAi,
    setResponses,
    setPanelStatus,
  })

  // Update context and reset edited flags when context changes
  useEffect(() => {
    const latestContext = getFullClinicalContext()
    setContext((previous) => {
      if (previous === latestContext) return previous
      resetEditedFlags()
      return latestContext
    })
  }, [getFullClinicalContext, resetEditedFlags])

  // Reset edited flags when panels change
  useEffect(() => {
    resetEditedFlags()
  }, [panels, resetEditedFlags])

  useAutoGenerate({
    panels,
    autoGenerate,
    canGenerate,
    context,
    runPanel,
  })

  const panelEntries = useMemo(() => {
    return panels.map((panel) => {
      const responseEntry = responses[panel.id] ?? { text: "", isEdited: false }
      const status = panelStatus[panel.id] ?? { isLoading: false, error: null }

      return {
        id: panel.id,
        label: panel.title,
        props: {
          title: panel.title,
          subtitle: panel.subtitle,
          prompt: prompts[panel.id] ?? panel.prompt,
          onPromptChange: (value: string) => handlePromptChange(panel.id, value),
          onRegenerate: () => runPanel(panel.id, { force: true }),
          isLoading: status.isLoading,
          response: responseEntry.text,
          error: status.error,
          canGenerate,
          onResponseChange: (value: string) => handleResponseChange(panel.id, value),
          isEdited: responseEntry.isEdited,
          modelMetadata: responseEntry.metadata ?? null,
          fallbackModelId: model,
        },
      }
    })
  }, [canGenerate, handlePromptChange, handleResponseChange, model, panelStatus, panels, prompts, responses, runPanel])

  const defaultTabValue = panelEntries[0]?.id ?? ""

  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-3">
        {!canGenerate && <ApiKeyWarning />}
        {panelEntries.length > 0 ? (
          <Tabs defaultValue={defaultTabValue} className="space-y-3">
            <TabsList className="flex w-full flex-nowrap gap-0.5 rounded-md bg-muted/40 p-0.5 min-w-0">
              {panelEntries.map((panel) => (
                <TabsTrigger
                  key={panel.id}
                  value={panel.id}
                  className="flex-1 min-w-[50px] px-2 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm overflow-hidden"
                >
                  <span className="truncate block w-full">{panel.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {panelEntries.map((panel) => (
              <TabsContent key={panel.id} value={panel.id} className="mt-0">
                <InsightPanel {...panel.props} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t.clinicalInsights.noTabsConfigured}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}
