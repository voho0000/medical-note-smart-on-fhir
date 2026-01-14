import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t.clinicalInsights.manageSettings}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleManageModels}>
          {t.clinicalInsights.manageModels || "管理模型"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleManageInsights}>
          {t.clinicalInsights.manageTabs || "管理標籤"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
