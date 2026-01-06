import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Settings, X, Plus, RotateCcw, ChevronLeft, ChevronRight, Trash2, Info } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"

interface TabManagementToolbarProps {
  currentTabId: string
  onTabChange: (tabId: string) => void
  isEditMode: boolean
  onEditModeChange: (isEdit: boolean) => void
}

export function TabManagementToolbar({ currentTabId, onTabChange, isEditMode, onEditModeChange }: TabManagementToolbarProps) {
  const { t } = useLanguage()
  const { panels, addPanel, removePanel, resetPanels, maxPanels, reorderPanels } = useClinicalInsightsConfig()
  const { setActiveTab } = useRightPanel()

  const handleManageModels = () => {
    setActiveTab('settings', 'ai')
  }

  const currentIndex = panels.findIndex((p) => p.id === currentTabId)
  const canAddPanel = panels.length < maxPanels
  const canRemovePanel = panels.length > 1
  const canMoveLeft = currentIndex > 0
  const canMoveRight = currentIndex < panels.length - 1

  const handleMoveLeft = () => {
    if (!canMoveLeft) return
    const newOrder = [...panels.map((p) => p.id)]
    const [removed] = newOrder.splice(currentIndex, 1)
    newOrder.splice(currentIndex - 1, 0, removed)
    reorderPanels(newOrder)
  }

  const handleMoveRight = () => {
    if (!canMoveRight) return
    const newOrder = [...panels.map((p) => p.id)]
    const [removed] = newOrder.splice(currentIndex, 1)
    newOrder.splice(currentIndex + 1, 0, removed)
    reorderPanels(newOrder)
  }

  const handleRemove = () => {
    if (!canRemovePanel) return
    const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0
    removePanel(currentTabId)
    if (panels[nextIndex] && panels[nextIndex].id !== currentTabId) {
      onTabChange(panels[nextIndex].id)
    } else if (panels[nextIndex + 1]) {
      onTabChange(panels[nextIndex + 1].id)
    }
  }

  const handleAdd = () => {
    if (!canAddPanel) return
    addPanel()
  }

  const handleReset = () => {
    resetPanels()
    onEditModeChange(false)
  }

  if (!isEditMode) {
    return (
      <div className="flex items-center justify-end gap-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">
                {t.clinicalInsights.languageWarning || "注意：修改過的標籤在切換語言時不會自動更新。重設為預設值以查看對應語言的標籤。"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManageModels}
          className="gap-1.5"
        >
          <Settings className="h-3.5 w-3.5" />
          {t.clinicalInsights.manageModels || "管理模型"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditModeChange(true)}
          className="gap-1.5"
        >
          <Settings className="h-3.5 w-3.5" />
          {t.clinicalInsights.manageTabs || "Manage Tabs"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 p-3 bg-muted/30 border border-border rounded-md">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {t.clinicalInsights.editMode || "Edit Mode"}:
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMoveLeft}
          disabled={!canMoveLeft}
          className="gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t.clinicalInsights.moveLeft || "Move Left"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMoveRight}
          disabled={!canMoveRight}
          className="gap-1"
        >
          {t.clinicalInsights.moveRight || "Move Right"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={!canRemovePanel}
          className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.clinicalInsights.deleteTab || "Delete"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!canAddPanel}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.clinicalInsights.addTab || "Add Tab"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t.clinicalInsights.reset || "Reset"}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => onEditModeChange(false)}
          className="gap-1"
        >
          <X className="h-3.5 w-3.5" />
          {t.common.close || "Close"}
        </Button>
      </div>
    </div>
  )
}
