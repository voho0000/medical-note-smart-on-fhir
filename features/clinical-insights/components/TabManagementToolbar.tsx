import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Settings, Share2, Library, Lock } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { SharePromptDialog, PromptGalleryDialog } from "@/features/prompt-gallery"
import { LoginRequiredDialog } from "@/features/prompt-gallery/components/LoginRequiredDialog"

interface TabManagementToolbarProps {
  currentTabId: string
  onTabChange: (tabId: string) => void
  currentPrompt?: string
  currentTitle?: string
  onPromptChange?: (prompt: string) => void
}

export function TabManagementToolbar({ 
  currentTabId, 
  onTabChange,
  currentPrompt = '',
  currentTitle = '',
  onPromptChange,
}: TabManagementToolbarProps) {
  const { t } = useLanguage()
  const { setActiveTab } = useRightPanel()
  const { user } = useAuth()
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showGalleryDialog, setShowGalleryDialog] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)

  const handleManageModels = () => {
    setActiveTab('settings', 'ai')
  }

  const handleManageInsights = () => {
    setActiveTab('settings', 'insights')
  }

  const handleSharePrompt = () => {
    if (!user) {
      setShowLoginDialog(true)
      return
    }
    setShowShareDialog(true)
  }

  const handleBrowseGallery = () => {
    setShowGalleryDialog(true)
  }

  const handleSelectPrompt = (prompt: any, useAs?: 'chat' | 'insight') => {
    // Only update insight prompt if useAs is 'insight' or undefined (default)
    if (useAs === 'chat') {
      // If user wants to use as chat template, do nothing here
      // (they should use it from Settings page)
      return
    }
    
    // 使用選擇的 Prompt 更新當前標籤的 Prompt
    if (onPromptChange && prompt.prompt) {
      onPromptChange(prompt.prompt)
    }
  }

  return (
    <>
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
        <DropdownMenuItem onClick={handleSharePrompt}>
          {user ? (
            <Share2 className="h-4 w-4 mr-2" />
          ) : (
            <Lock className="h-4 w-4 mr-2" />
          )}
          {t.promptGallery?.sharePrompt || "分享模板"}
          {!user && <span className="ml-2 text-xs text-muted-foreground">(需登入)</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleBrowseGallery}>
          <Library className="h-4 w-4 mr-2" />
          {t.promptGallery?.browseGallery || "瀏覽範本庫"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleManageModels}>
          {t.clinicalInsights.manageModels || "管理模型"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleManageInsights}>
          {t.clinicalInsights.manageTabs || "管理標籤"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Share Prompt Dialog */}
    <SharePromptDialog
      open={showShareDialog}
      onOpenChange={setShowShareDialog}
      initialTitle={currentTitle}
      initialPrompt={currentPrompt}
      initialType="insight"
    />

    {/* Prompt Gallery Dialog */}
    <PromptGalleryDialog
      open={showGalleryDialog}
      onOpenChange={setShowGalleryDialog}
      mode="insight"
      onSelectPrompt={handleSelectPrompt}
    />

    {/* Login Required Dialog */}
    <LoginRequiredDialog
      open={showLoginDialog}
      onOpenChange={setShowLoginDialog}
    />
    </>
  )
}
