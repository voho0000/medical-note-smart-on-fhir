// Refactored Clinical Insights Settings
"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { InsightTabEditor } from './InsightTabEditor'

export function ClinicalInsightsSettings() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { 
    panels, 
    updatePanel, 
    addPanel, 
    removePanel, 
    resetPanels, 
    savePanels,
    maxPanels, 
    reorderPanels,
    isSaving
  } = useClinicalInsightsConfig()

  const canAddPanel = panels.length < maxPanels
  const canRemovePanel = panels.length > 1
  const defaultTab = panels[0]?.id || ""

  const handleMove = (panelId: string, direction: "up" | "down") => {
    const currentIndex = panels.findIndex((panel) => panel.id === panelId)
    if (currentIndex === -1) return

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= panels.length) return

    const orderIds = [...panels.map((panel) => panel.id)]
    const [removed] = orderIds.splice(currentIndex, 1)
    orderIds.splice(targetIndex, 0, removed)
    reorderPanels(orderIds)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{t.settings.clinicalInsightsSettingsTitle}</h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
              <p className="text-xs">
                {t.settings.clinicalInsightsLanguageWarning}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.settings.clinicalInsightsSettingsDesc}
      </p>

      <div className="space-y-5">

        {/* Insight Tabs */}
        {panels.length > 0 && (
          <Tabs defaultValue={defaultTab} className="space-y-4 overflow-hidden">
            <div className="flex items-center gap-2 w-full">
              <TabsList className="flex flex-1 flex-nowrap gap-1 rounded-md bg-muted/50 p-1 min-w-0 w-full h-9 border">
                {panels.map((panel, index) => (
                  <TabsTrigger
                    key={panel.id}
                    value={panel.id}
                    className="flex-1 min-w-[40px] px-2 py-1 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    {index + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addPanel}
                disabled={!canAddPanel}
                className="h-9 w-9 shrink-0 p-0 border-2 border-primary/50 hover:border-primary hover:bg-primary/10 text-lg font-semibold"
              >
                +
              </Button>
            </div>
            {panels.map((panel, index) => (
              <TabsContent key={panel.id} value={panel.id} className="mt-0">
                <InsightTabEditor
                  panel={panel}
                  index={index}
                  canRemove={canRemovePanel}
                  canMoveUp={index > 0}
                  canMoveDown={index < panels.length - 1}
                  onUpdate={updatePanel}
                  onRemove={removePanel}
                  onMove={handleMove}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            type="button" 
            variant="default" 
            onClick={savePanels}
            disabled={isSaving}
            className="bg-primary hover:bg-primary/90"
          >
            {isSaving ? t.settings.saving : t.settings.saveTemplates}
          </Button>
          <Button type="button" variant="outline" onClick={resetPanels} className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10">
            {t.settings.resetToDefaults}
          </Button>
          <span className="text-xs text-muted-foreground">
            {panels.length}/{maxPanels} {t.settings.tabsInUse} {user ? t.settings.savedToAccount : t.settings.savedToBrowser}
          </span>
        </div>
      </div>
    </div>
  )
}

export default ClinicalInsightsSettings
