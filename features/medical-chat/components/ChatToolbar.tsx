"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { useAutoIncludeContext, useSetAutoIncludeContext } from "@/src/application/stores/chat.store"
import { useModelPref, useSetModelFor, MODEL_PREF_DEFAULTS } from "@/src/application/stores/model-prefs.store"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import { Plus, FileText, Settings, ChevronDown, Library, Sparkles, KeyRound, SlidersHorizontal } from "lucide-react"

interface Template {
  id: string
  label: string
  content: string
  shortcut?: string
}

interface ChatToolbarProps {
  onInsertContext: () => void
  onInsertTemplate: () => void
  templates: Template[]
  selectedTemplateId?: string
  onTemplateChange: (id: string) => void
  hasTemplateContent: boolean
  onOpenGallery?: () => void
  onManageTemplates: () => void
  isLoadingClinicalData?: boolean
  /** Deep mode active: models flagged disableAgentMode are locked in the picker. */
  agentModeActive?: boolean
  /** The picker normally lives in the chat header strip (this toolbar is
   *  cramped); the fullscreen overlay has no header strip, so only there
   *  does the toolbar host it. */
  showModelPicker?: boolean
}

export function ChatToolbar({
  onInsertContext,
  onInsertTemplate,
  templates,
  selectedTemplateId,
  onTemplateChange,
  hasTemplateContent,
  onOpenGallery,
  onManageTemplates,
  isLoadingClinicalData = false,
  agentModeActive = false,
  showModelPicker = false,
}: ChatToolbarProps) {
  const { t } = useLanguage()
  const autoIncludeContext = useAutoIncludeContext()
  const setAutoIncludeContext = useSetAutoIncludeContext()
  const chatModelPref = useModelPref('chat')
  const setModelFor = useSetModelFor()

  // Models are picked in-panel now; Settings only holds the API keys.
  const { setActiveTab } = useRightPanel()
  const handleManageKeys = () => {
    setActiveTab('settings', 'ai')
  }

  const handleOpenGallery = () => {
    if (onOpenGallery) {
      onOpenGallery()
    }
  }
  
  // Mobile-friendly toolbar: bigger touch targets (h-9 groups / h-8 buttons,
  // 16px icons) and consistent icon-only on phones — every label is
  // `hidden sm:inline` so the row never shows a half-labelled mix, and the
  // template button drops its reserved 100px (label is hidden anyway). The
  // parent row wraps on mobile instead of hiding buttons behind a sideways
  // scroll. Desktop (sm+) keeps the original compact density.
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5 h-9 sm:h-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={onInsertContext}
          disabled={isLoadingClinicalData || autoIncludeContext}
          className={`h-8 sm:h-7 gap-0.5 px-2 sm:px-1.5 text-xs ${autoIncludeContext ? 'opacity-50' : ''}`}
          title={
            autoIncludeContext
              ? (t.chat.autoIncludeEnabled || "自動帶入已啟用")
              : isLoadingClinicalData
                ? t.chat.loadingClinicalData
                : t.chat.insertContext
          }
        >
          <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
          <span className="hidden sm:inline">{isLoadingClinicalData ? t.chat.loading : t.chat.insertContext}</span>
        </Button>
        <div className="flex items-center gap-1 px-1.5 border-l">
          <Switch
            checked={autoIncludeContext}
            onCheckedChange={setAutoIncludeContext}
            className="scale-90 sm:scale-75"
            title={
              autoIncludeContext
                ? (t.chat.autoIncludeContextTooltipOn || "每次發送訊息時自動包含病歷資料")
                : (t.chat.autoIncludeContextTooltipOff || "點擊「臨床資料」按鈕手動帶入")
            }
          />
          <label
            className={`text-[0.625rem] cursor-pointer select-none whitespace-nowrap hidden sm:inline ${
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
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5 h-9 sm:h-8">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            className="h-8 sm:h-7 gap-0.5 px-1.5 sm:px-1 text-xs hover:bg-muted w-auto sm:w-[100px]"
            title={templates.find(t => t.id === selectedTemplateId)?.label || t.chat.insertTemplate}
          >
            <FileText className="h-4 w-4 sm:h-3 sm:w-3 shrink-0" />
            <span className="truncate hidden sm:inline">
              {templates.find(t => t.id === selectedTemplateId)?.label || t.chat.insertTemplate}
            </span>
          </Button>
          <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger className="h-7 w-7 sm:h-6 sm:w-6 gap-0 border-0 rounded bg-muted px-1 py-0 shadow-none hover:bg-muted-foreground/15">
            </SelectTrigger>
            <SelectContent align="start" className="w-[200px] text-xs">
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="truncate">{template.label}</span>
                    {template.shortcut ? (
                      <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground/80">
                        /{template.shortcut}
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onManageTemplates}
            className="h-7 w-7 border-l sm:h-6 sm:w-6"
            aria-label={t.chat.manageTemplates || "管理範本"}
            title={t.chat.manageTemplates || "管理範本"}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      {showModelPicker && (
        <div className="h-9 sm:h-8 flex items-center">
          <ModelPicker
            modelId={chatModelPref}
            fallbackModelId={MODEL_PREF_DEFAULTS.chat}
            onSelect={(id) => setModelFor('chat', id)}
            tooltip={t.modelPicker.chatTooltip}
            agentModeActive={agentModeActive}
          />
        </div>
      )}
      <div className="h-9 sm:h-8 flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 sm:h-7 gap-1 px-2 sm:px-1.5 text-xs border rounded-md bg-muted/30">
            <Settings className="h-4 w-4 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">{t.chat.settings}</span>
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
          <DropdownMenuItem onClick={handleManageKeys} className="gap-2 cursor-pointer">
            <KeyRound className="h-3.5 w-3.5" />
            {t.chat.manageKeys || "API 金鑰"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onManageTemplates} className="gap-2 cursor-pointer">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t.chat.manageTemplates || "管理範本"}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
