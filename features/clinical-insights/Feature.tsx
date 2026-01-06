// Refactored Clinical Insights Feature
"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"

import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useAiQuery } from "@/src/application/hooks/use-ai-query.hook"
import { useAiStreaming } from "@/src/application/hooks/use-ai-streaming.hook"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { useNote } from "@/src/application/providers/note.provider"
import { hasChatProxy } from "@/src/shared/config/env.config"

import { useInsightPanels } from './hooks/useInsightPanels'
import { useInsightGeneration } from './hooks/useInsightGeneration'
import { useAutoGenerate } from './hooks/useAutoGenerate'
import { InsightPanel } from './components/InsightPanel'
import { ApiKeyWarning } from './components/ApiKeyWarning'
import { TabManagementToolbar } from './components/TabManagementToolbar'

export default function ClinicalInsightsFeature() {
  const { t } = useLanguage()
  const { panels: configPanels } = useClinicalInsightsConfig()
  const { apiKey: openAiKey, geminiKey } = useApiKey()
  const { getFullClinicalContext } = useClinicalContext()
  const { isLoading: clinicalDataLoading } = useClinicalData()
  const { model } = useNote()
  const { queryAi } = useAiQuery(openAiKey, geminiKey)

  const [context, setContext] = useState("")
  const [activeTabId, setActiveTabId] = useState<string>("")
  const [isEditMode, setIsEditMode] = useState(false)
  const currentPanelIdRef = useRef<string | null>(null)
  
  // Use configPanels directly instead of caching in ref
  const panels = configPanels

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
  
  // Use streaming hook with real-time updates
  const { streamAi, stopStreaming } = useAiStreaming(openAiKey, geminiKey, {
    onChunk: (chunk) => {
      // Update response in real-time during streaming
      const panelId = currentPanelIdRef.current
      if (!panelId) return
      
      setResponses((prev) => ({
        ...prev,
        [panelId]: { text: chunk, isEdited: false, metadata: prev[panelId]?.metadata },
      }))
    },
  })

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(openAiKey || geminiKey) || canUseProxy

  const { runPanel, stopPanel } = useInsightGeneration({
    panels,
    prompts,
    responses,
    context,
    openAiKey,
    geminiKey,
    canUseProxy,
    model,
    queryAi,
    streamAi,
    stopStreaming,
    currentPanelIdRef,
    setResponses,
    setPanelStatus,
  })

  // Update context when it changes (without resetting responses)
  useEffect(() => {
    const latestContext = getFullClinicalContext()
    setContext(latestContext)
  }, [getFullClinicalContext])

  useAutoGenerate({
    panels,
    canGenerate,
    context,
    runPanel,
  })

  // Initialize active tab when panels change
  useEffect(() => {
    if (!activeTabId && panels.length > 0) {
      setActiveTabId(panels[0].id)
    } else if (activeTabId && !panels.find(p => p.id === activeTabId)) {
      setActiveTabId(panels[0]?.id || "")
    }
  }, [panels, activeTabId])

  // Only enable insights when data is fully loaded and context is available
  const hasData = !clinicalDataLoading && context.trim().length > 0

  const panelEntries = useMemo(() => {
    return panels.map((panel) => {
      const responseEntry = responses[panel.id] ?? { text: "", isEdited: false }
      const status = panelStatus[panel.id] ?? { isLoading: false, error: null }

      return {
        id: panel.id,
        label: panel.title,
        props: {
          panelId: panel.id,
          title: panel.title,
          subtitle: panel.subtitle,
          prompt: prompts[panel.id] ?? panel.prompt,
          onPromptChange: (value: string) => handlePromptChange(panel.id, value),
          onRegenerate: () => runPanel(panel.id, { force: true }),
          onStopGeneration: () => stopPanel(panel.id),
          isLoading: status.isLoading,
          response: responseEntry.text,
          error: status.error,
          canGenerate,
          hasData,
          onResponseChange: (value: string) => handleResponseChange(panel.id, value),
          isEdited: responseEntry.isEdited,
          modelMetadata: responseEntry.metadata ?? null,
          fallbackModelId: model,
          autoGenerate: panel.autoGenerate ?? false,
          isEditMode,
        },
      }
    })
  }, [canGenerate, hasData, handlePromptChange, handleResponseChange, model, panelStatus, panels, prompts, responses, runPanel])

  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-4">
        {!canGenerate && <ApiKeyWarning />}
        {panelEntries.length > 0 ? (
          <>
            <TabManagementToolbar 
              currentTabId={activeTabId} 
              onTabChange={setActiveTabId}
              isEditMode={isEditMode}
              onEditModeChange={setIsEditMode}
            />
            <Tabs value={activeTabId} onValueChange={setActiveTabId} className="space-y-4">
            <TabsList className="grid w-full gap-1 h-9 bg-muted/40 p-1 border border-border/50 rounded-md" style={{ gridTemplateColumns: `repeat(${panelEntries.length}, minmax(0, 1fr))` }}>
              {panelEntries.map((panel) => (
                <TabsTrigger
                  key={panel.id}
                  value={panel.id}
                  className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
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
          </> ) : (
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
