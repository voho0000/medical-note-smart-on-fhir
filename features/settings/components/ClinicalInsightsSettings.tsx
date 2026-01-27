// Refactored Clinical Insights Settings
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info, Library, Share2, Lock } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { InsightTabEditor } from './InsightTabEditor'
import { SharePromptDialog, PromptGalleryDialog } from "@/features/prompt-gallery"
import { LoginRequiredDialog } from "@/features/prompt-gallery/components/LoginRequiredDialog"
import type { SharedPrompt } from "@/features/prompt-gallery/types/prompt.types"

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
  
  const [activeTab, setActiveTab] = useState(panels[0]?.id || "")
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showGalleryDialog, setShowGalleryDialog] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [promptToShare, setPromptToShare] = useState<{ title: string; prompt: string } | null>(null)

  const handleAddPanel = () => {
    const newPanelId = addPanel()
    if (newPanelId) {
      setActiveTab(newPanelId)
    }
  }

  const handleRemovePanel = (id: string) => {
    removePanel(id)
    // Switch to first panel after deletion
    if (panels.length > 1) {
      const remainingPanels = panels.filter(p => p.id !== id)
      if (remainingPanels.length > 0) {
        setActiveTab(remainingPanels[0].id)
      }
    }
  }

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

  const handleSharePrompt = () => {
    const currentPanel = panels.find(p => p.id === activeTab)
    if (currentPanel) {
      setPromptToShare({
        title: currentPanel.title,
        prompt: currentPanel.prompt
      })
      setShowShareDialog(true)
    }
  }

  const handleSelectPrompt = async (prompt: SharedPrompt, useAs?: 'chat' | 'insight') => {
    // Only add insight panel if useAs is 'insight' or undefined (default)
    if (useAs === 'chat') {
      return
    }

    // Add prompt as a new panel (similar to Chat Templates behavior)
    if (canAddPanel) {
      const newPanelId = addPanel()
      if (newPanelId) {
        updatePanel(newPanelId, {
          title: prompt.title,
          prompt: prompt.prompt
        })
        setActiveTab(newPanelId)
        
        // Wait for state update to complete before saving
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Auto-save to Firestore after adding panel from gallery
        await savePanels()
      }
    }
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

        {/* Insight Panel Selector */}
        {panels.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 w-full">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="選擇範本" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {panels.map((panel, index) => (
                    <SelectItem key={panel.id} value={panel.id}>
                      {index + 1}. {panel.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddPanel}
                disabled={!canAddPanel}
                className="h-10 w-10 shrink-0 p-0 border-2 border-primary/50 hover:border-primary hover:bg-primary/10 text-lg font-semibold"
              >
                +
              </Button>
            </div>
            {panels.map((panel, index) => (
              <div key={panel.id} className={activeTab === panel.id ? "block" : "hidden"}>
                <InsightTabEditor
                  panel={panel}
                  index={index}
                  canRemove={canRemovePanel}
                  canMoveUp={index > 0}
                  canMoveDown={index < panels.length - 1}
                  onUpdate={updatePanel}
                  onRemove={handleRemovePanel}
                  onMove={handleMove}
                  onShare={(panel) => {
                    setPromptToShare({ title: panel.title, prompt: panel.prompt })
                    setShowShareDialog(true)
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  type="button" 
                  variant="default" 
                  onClick={() => {
                    if (!user) {
                      setShowLoginDialog(true)
                      return
                    }
                    savePanels()
                  }}
                  disabled={isSaving}
                  className={user 
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }
                >
                  {!user && <Lock className="h-4 w-4 mr-2" />}
                  {isSaving ? t.settings.saving : t.settings.saveTemplates}
                </Button>
              </TooltipTrigger>
              {!user && (
                <TooltipContent>
                  <p>請先登入以儲存模板</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setShowGalleryDialog(true)}
            className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10"
          >
            <Library className="h-4 w-4 mr-2" />
            {t.promptGallery?.browseGallery || "瀏覽範本庫"}
          </Button>
          <Button type="button" variant="outline" onClick={resetPanels} className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10">
            {t.settings.resetToDefaults}
          </Button>
        </div>
      </div>

      {/* Share Prompt Dialog */}
      <SharePromptDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        initialTitle={promptToShare?.title || ''}
        initialPrompt={promptToShare?.prompt || ''}
        initialType="insight"
      />

      {/* Prompt Gallery Dialog */}
      <PromptGalleryDialog
        open={showGalleryDialog}
        onOpenChange={setShowGalleryDialog}
        mode="insight"
        onSelectPrompt={handleSelectPrompt}
      />
    </div>
  )
}

export default ClinicalInsightsSettings
