"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { Plus, Trash2, FileText, Settings, ChevronDown, Library } from "lucide-react"

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
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onInsertContext} 
          disabled={isLoadingClinicalData}
          className="h-7 gap-1 px-1.5 text-xs"
          title={isLoadingClinicalData ? t.chat.loadingClinicalData : undefined}
        >
          <Plus className="h-3 w-3" />
          {isLoadingClinicalData ? t.chat.loading : t.chat.insertContext}
        </Button>
      </div>
      {templates.length > 0 ? (
        <div className="flex items-center gap-0.5 rounded-md border bg-primary/5 p-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            className="h-7 gap-1 px-1 text-xs hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" />
            <FileText className="h-3 w-3" />
            <span className="max-w-[90px] truncate">
              {templates.find(t => t.id === selectedTemplateId)?.label || t.chat.insertTemplate}
            </span>
          </Button>
          <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger className="h-7 w-6 gap-0 border-0 bg-transparent px-1 py-0 shadow-none hover:bg-primary/10">
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
      <div className="flex items-center gap-0.5 rounded-md border border-destructive/20 bg-destructive/5 p-0.5">
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
  )
}
