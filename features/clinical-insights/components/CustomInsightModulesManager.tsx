// Custom Summary Modules Manager
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
  Cloud,
  Eye,
  HardDrive,
  Library,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Stethoscope,
  User,
  Zap,
} from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import {
  MAX_AUTO_INSIGHT_MODULES,
  MAX_SUMMARY_INSIGHT_MODULES,
} from "@/src/shared/constants/clinical-insights.constants"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import {
  MODEL_PREF_DEFAULTS,
  useModelPref,
  useSetModelFor,
} from "@/src/application/stores/model-prefs.store"
import { cn } from "@/src/shared/utils/cn.utils"
import { CustomInsightModuleEditor } from "./CustomInsightModuleEditor"
import { SharePromptDialog, PromptGalleryDialog } from "@/features/prompt-gallery"
import type { SharedPrompt } from "@/features/prompt-gallery/types/prompt.types"

interface CustomInsightModulesManagerProps {
  initialPanelId?: string
}

export function CustomInsightModulesManager({ initialPanelId }: CustomInsightModulesManagerProps = {}) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()
  const insightsModel = useModelPref("insights")
  const setModelFor = useSetModelFor()
  const {
    panels,
    updatePanel,
    updatePanelAndSave,
    addPanel,
    removePanel,
    resetPanels,
    savePanels,
    maxPanels,
    reorderPanels,
    isSaving,
  } = useClinicalInsightsConfig()

  const audienceLabel = audience === "medical" ? t.audience.medical : t.audience.patient
  const AudienceIcon = audience === "medical" ? Stethoscope : User
  const canAddPanel = panels.length < maxPanels
  const canRemovePanel = panels.length > 1
  const summaryModuleCount = panels.filter((panel) => panel.showInSummary).length
  const autoModuleCount = panels.filter((panel) => panel.showInSummary && panel.autoGenerate).length

  const [activeId, setActiveId] = useState(initialPanelId || panels[0]?.id || "")
  const resolvedActiveId = panels.some((panel) => panel.id === activeId)
    ? activeId
    : (panels[0]?.id ?? "")
  const activePanel = panels.find((panel) => panel.id === resolvedActiveId)
  const activeIndex = activePanel ? panels.findIndex((panel) => panel.id === activePanel.id) : -1

  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showGalleryDialog, setShowGalleryDialog] = useState(false)
  const [promptToShare, setPromptToShare] = useState<{ title: string; prompt: string } | null>(null)

  const handleAddPanel = () => {
    const newPanelId = addPanel()
    if (newPanelId) setActiveId(newPanelId)
  }

  const handleRemovePanel = (id: string) => {
    const remaining = panels.filter((panel) => panel.id !== id)
    removePanel(id)
    if (resolvedActiveId === id) setActiveId(remaining[0]?.id ?? "")
  }

  const handleMove = (panelId: string, direction: "up" | "down") => {
    const currentIndex = panels.findIndex((panel) => panel.id === panelId)
    if (currentIndex === -1) return
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= panels.length) return
    const orderedIds = panels.map((panel) => panel.id)
    const [removed] = orderedIds.splice(currentIndex, 1)
    orderedIds.splice(targetIndex, 0, removed)
    reorderPanels(orderedIds)
  }

  const handleSelectPrompt = async (prompt: SharedPrompt, useAs?: "chat" | "insight") => {
    if (useAs === "chat" || !canAddPanel) return
    const newPanelId = addPanel({
      title: prompt.title,
      prompt: prompt.prompt,
      showInSummary: false,
      autoGenerate: false,
    })
    if (!newPanelId) return
    setActiveId(newPanelId)
    await new Promise((resolve) => setTimeout(resolve, 200))
    await savePanels()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-violet-600 shadow-sm dark:text-violet-300">
              <AudienceIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{audienceLabel}</p>
              <p className="text-[0.625rem] text-muted-foreground">{t.settings.customModuleAudienceShort}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-[0.625rem] font-medium text-muted-foreground">
              <Eye className="h-3 w-3 text-violet-500" />
              {summaryModuleCount}/{MAX_SUMMARY_INSIGHT_MODULES} {t.settings.moduleVisibleShort}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-[0.625rem] font-medium text-muted-foreground">
              <Zap className="h-3 w-3 text-amber-500" />
              {autoModuleCount}/{MAX_AUTO_INSIGHT_MODULES} {t.settings.moduleAutoShort}
            </span>
            <ModelPicker
              modelId={insightsModel}
              fallbackModelId={MODEL_PREF_DEFAULTS.insights}
              onSelect={(id) => setModelFor("insights", id)}
              tooltip={t.modelPicker.insightsTooltip}
              align="end"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:hidden">
        <Select value={resolvedActiveId} onValueChange={setActiveId}>
          <SelectTrigger className="h-9 min-w-0 flex-1">
            <SelectValue placeholder={t.settings.moduleSelectPlaceholder} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            {panels.map((panel, index) => (
              <SelectItem key={panel.id} value={panel.id}>{index + 1}. {panel.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          onClick={handleAddPanel}
          disabled={!canAddPanel}
          aria-label={t.settings.addTab}
          title={t.settings.addTab}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden rounded-xl border bg-muted/10 sm:block">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{t.settings.moduleListTitle}</p>
              <p className="text-[0.625rem] text-muted-foreground">{panels.length} {t.settings.tabsInUse}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleAddPanel}
              disabled={!canAddPanel}
              aria-label={t.settings.addTab}
              title={t.settings.addTab}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <nav className="max-h-[26rem] space-y-1 overflow-y-auto p-2" aria-label={t.settings.moduleListTitle}>
            {panels.map((panel, index) => (
              <button
                key={panel.id}
                type="button"
                onClick={() => setActiveId(panel.id)}
                className={cn(
                  "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                  panel.id === resolvedActiveId
                    ? "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                    : "border-transparent hover:border-border hover:bg-background",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.625rem] font-semibold",
                    panel.id === resolvedActiveId ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground",
                  )}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" title={panel.title}>{panel.title}</p>
                    <div className="mt-1 flex items-center gap-1">
                      {panel.showInSummary ? <Eye className="h-3 w-3 text-violet-500" /> : null}
                      {panel.autoGenerate ? <Zap className="h-3 w-3 text-amber-500" /> : null}
                      {!panel.showInSummary && !panel.autoGenerate ? (
                        <span className="text-[0.5625rem] text-muted-foreground">{t.settings.moduleLibraryOnly}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </nav>

          <div className="space-y-1 border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs" onClick={() => setShowGalleryDialog(true)}>
              <Library className="h-3.5 w-3.5 text-violet-500" />
              {t.promptGallery?.browseGallery || "Browse Gallery"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground" onClick={() => void resetPanels()}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t.settings.resetToDefaults}
            </Button>
          </div>
        </aside>

        <div className="min-w-0">
          {activePanel && activeIndex >= 0 ? (
            <CustomInsightModuleEditor
              panel={activePanel}
              index={activeIndex}
              canRemove={canRemovePanel}
              canMoveUp={activeIndex > 0}
              canMoveDown={activeIndex < panels.length - 1}
              summaryModuleCount={summaryModuleCount}
              autoModuleCount={autoModuleCount}
              maxSummaryModules={MAX_SUMMARY_INSIGHT_MODULES}
              maxAutoModules={MAX_AUTO_INSIGHT_MODULES}
              onUpdate={updatePanel}
              onUpdateAndSave={user ? updatePanelAndSave : undefined}
              onRemove={handleRemovePanel}
              onMove={handleMove}
              onShare={(panel) => {
                setPromptToShare({ title: panel.title, prompt: panel.prompt })
                setShowShareDialog(true)
              }}
            />
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-violet-400" />
              {t.settings.moduleSelectPlaceholder}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          {user ? <Cloud className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
          {user ? t.settings.moduleAccountSync : t.settings.moduleBrowserAutosave}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs sm:hidden" onClick={() => setShowGalleryDialog(true)}>
            <Library className="h-3.5 w-3.5" />
            {t.promptGallery?.browseGallery || "Browse Gallery"}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground sm:hidden" onClick={() => void resetPanels()}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t.settings.resetToDefaults}
          </Button>
          {user ? (
            <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void savePanels()} disabled={isSaving}>
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t.settings.saving : t.settings.saveTemplates}
            </Button>
          ) : null}
        </div>
      </div>

      <SharePromptDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        initialTitle={promptToShare?.title || ""}
        initialPrompt={promptToShare?.prompt || ""}
        initialType="insight"
      />

      <PromptGalleryDialog
        open={showGalleryDialog}
        onOpenChange={setShowGalleryDialog}
        mode="insight"
        onSelectPrompt={handleSelectPrompt}
      />
    </div>
  )
}

export default CustomInsightModulesManager
