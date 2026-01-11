// Refactored Clinical Insights Feature
"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"

import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useAllApiKeys, useModel } from "@/src/stores/ai-config.store"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { hasChatProxy } from "@/src/shared/config/env.config"

import { useInsightPanels } from './hooks/useInsightPanels'
import { useInsightGeneration } from './hooks/useInsightGeneration'
import { useAutoGenerate } from './hooks/useAutoGenerate'
import { InsightPanel } from './components/InsightPanel'
import { ApiKeyWarning } from './components/ApiKeyWarning'
import { TabManagementToolbar } from './components/TabManagementToolbar'

export default function ClinicalInsightsFeature() {
  const { t } = useLanguage()
  const { panels: configPanels, updatePanel } = useClinicalInsightsConfig()
  const { apiKey: openAiKey, geminiKey } = useAllApiKeys()
  const { getFullClinicalContext } = useClinicalContext()
  const { isLoading: clinicalDataLoading } = useClinicalData()
  const model = useModel()

  const [context, setContext] = useState("")
  const [activeTabId, setActiveTabId] = useState<string>("")
  const [isEditMode, setIsEditMode] = useState(false)
  
  const panels = configPanels

  // Prompts management (no state ownership)
  const { prompts, handlePromptChange } = useInsightPanels(panels, (panelId, prompt) => {
    updatePanel(panelId, { prompt })
  })

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(openAiKey || geminiKey) || canUseProxy

  // Single Source of Truth: All state owned by useInsightGeneration
  const { runPanel, stopPanel, responses, panelStatus, setResponses } = useInsightGeneration({
    panels,
    prompts,
    context,
    model,
  })

  // Response management functions (operate on SSOT)
  const handleResponseChange = useCallback((panelId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { 
        text: value, 
        isEdited: true, 
        metadata: value === "" ? null : (prev[panelId]?.metadata ?? null)
      },
    }))
  }, [setResponses])

  const clearResponse = useCallback((panelId: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { text: "", isEdited: false, metadata: null },
    }))
  }, [setResponses])

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
          onClearResponse: () => clearResponse(panel.id),
          isEdited: responseEntry.isEdited,
          modelMetadata: responseEntry.metadata ?? null,
          fallbackModelId: model,
          autoGenerate: panel.autoGenerate ?? false,
          isEditMode,
        },
      }
    })
  }, [canGenerate, hasData, handlePromptChange, handleResponseChange, clearResponse, model, panelStatus, panels, prompts, responses, runPanel, stopPanel, isEditMode])

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
