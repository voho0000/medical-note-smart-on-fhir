import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"

interface TabManagementToolbarProps {
  currentTabId: string
  onTabChange: (tabId: string) => void
}

export function TabManagementToolbar({ currentTabId, onTabChange }: TabManagementToolbarProps) {
  const { t } = useLanguage()
  const { setActiveTab } = useRightPanel()

  const handleManageModels = () => {
    setActiveTab('settings', 'ai')
  }

  const handleManageInsights = () => {
    setActiveTab('settings', 'insights')
  }

  return (
    <div className="flex items-center justify-end gap-2">
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
        onClick={handleManageInsights}
        className="gap-1.5"
      >
        <Settings className="h-3.5 w-3.5" />
        {t.clinicalInsights.manageTabs || "管理標籤"}
      </Button>
    </div>
  )
}
