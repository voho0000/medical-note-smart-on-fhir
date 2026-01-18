"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { useAutoIncludeContext, useSetAutoIncludeContext } from "@/src/application/stores/chat.store"
import { Plus, Trash2, FileText, Settings, ChevronDown, Library, Sparkles } from "lucide-react"

interface Template {
  id: string
  label: string
  content: string
}

interface ChatToolbarProps {
  onInsertContext: () => void
  onResetChat: () => void
  onInsertTemplate: () => void
  hasChatMessages: boolean
  templates: Template[]
  selectedTemplateId?: string
  onTemplateChange: (id: string) => void
  hasTemplateContent: boolean
  onOpenGallery?: () => void
  isLoadingClinicalData?: boolean
}

export function ChatToolbar({
  onInsertContext,
  onResetChat,
  onInsertTemplate,
  hasChatMessages,
  templates,
  selectedTemplateId,
  onTemplateChange,
  hasTemplateContent,
  onOpenGallery,
  isLoadingClinicalData = false,
}: ChatToolbarProps) {
  const { t } = useLanguage()
  const { setActiveTab } = useRightPanel()
  const autoIncludeContext = useAutoIncludeContext()
  const setAutoIncludeContext = useSetAutoIncludeContext()

  const handleManageTemplates = () => {
    setActiveTab('settings', 'templates')
  }

  const handleManageModels = () => {
    setActiveTab('settings', 'ai')
  }

  const handleOpenGallery = () => {
    if (onOpenGallery) {
      onOpenGallery()
    }
  }
  
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5 h-8">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onInsertContext} 
          disabled={isLoadingClinicalData || autoIncludeContext}
          className={`h-7 gap-0.5 px-1.5 text-xs ${autoIncludeContext ? 'opacity-50' : ''}`}
          title={
            autoIncludeContext 
              ? (t.chat.autoIncludeEnabled || "自動帶入已啟用")
              : isLoadingClinicalData 
                ? t.chat.loadingClinicalData 
                : t.chat.insertContext
          }
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">{isLoadingClinicalData ? t.chat.loading : t.chat.insertContext}</span>
        </Button>
        <div className="flex items-center gap-1 px-1.5 border-l">
          <Switch
            checked={autoIncludeContext}
            onCheckedChange={setAutoIncludeContext}
            className="scale-75"
            title={
              autoIncludeContext
                ? (t.chat.autoIncludeContextTooltipOn || "每次發送訊息時自動包含病歷資料")
                : (t.chat.autoIncludeContextTooltipOff || "點擊「臨床資料」按鈕手動帶入")
            }
          />
          <label 
            className={`text-[10px] cursor-pointer select-none whitespace-nowrap hidden sm:inline ${
              autoIncludeContext ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
            onClick={() => setAutoIncludeContext(!autoIncludeContext)}
          >
            {autoIncludeContext && <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />}
            {t.chat.autoInclude || "自動"}
          </label>
        </div>
      </div>
      {templates.length > 0 ? (
        <div className="flex items-center gap-0.5 rounded-md border bg-primary/5 p-0.5 h-8">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            className="h-7 gap-0.5 px-1 text-xs hover:bg-primary/10 w-[100px]"
            title={templates.find(t => t.id === selectedTemplateId)?.label || t.chat.insertTemplate}
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate hidden sm:inline">
              {templates.find(t => t.id === selectedTemplateId)?.label || t.chat.insertTemplate}
            </span>
          </Button>
          <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger className="h-6 w-6 gap-0 border-0 rounded bg-primary/15 dark:bg-primary/30 px-1 py-0 shadow-none hover:bg-primary/25 dark:hover:bg-primary/40">
            </SelectTrigger>
            <SelectContent align="start" className="w-[200px] text-xs">
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center gap-0.5 rounded-md border border-destructive/20 bg-destructive/5 p-0.5 h-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetChat}
          disabled={!hasChatMessages}
          className="h-7 gap-1 px-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          {t.chat.resetChat}
        </Button>
      </div>
      <div className="h-8 flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs border rounded-md bg-muted/30">
            <Settings className="h-3 w-3" />
            {t.chat.settings}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {onOpenGallery && (
            <DropdownMenuItem onClick={handleOpenGallery} className="gap-2 cursor-pointer">
              <Library className="h-3.5 w-3.5" />
              {t.promptGallery.browseGallery}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleManageModels} className="gap-2 cursor-pointer">
            <Settings className="h-3.5 w-3.5" />
            {t.chat.manageModels || "管理模型"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleManageTemplates} className="gap-2 cursor-pointer">
            <Settings className="h-3.5 w-3.5" />
            {t.chat.manageTemplates || "管理範本"}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
