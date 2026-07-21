"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useModelPref, MODEL_PREF_DEFAULTS } from "@/src/application/stores/model-prefs.store"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import { ChevronDown, FileText, Library, SlidersHorizontal } from "lucide-react"

interface Template {
  id: string
  label: string
  content: string
  shortcut?: string
}

interface ChatToolbarProps {
  onInsertTemplate: () => void
  templates: Template[]
  selectedTemplateId?: string
  onTemplateChange: (id: string) => void
  hasTemplateContent: boolean
  onOpenGallery?: () => void
  onManageTemplates: () => void
  /** MedicalChat owns the privacy boundary around model changes. Keeping the
   * picker callback outside this toolbar prevents fullscreen mode from
   * bypassing the abort/reset performed by the header picker. */
  onModelSelect: (id: string) => void
  /** The picker normally lives in the chat header strip (this toolbar is
   *  cramped); the fullscreen overlay has no header strip, so only there
   *  does the toolbar host it. */
  showModelPicker?: boolean
}

export function ChatToolbar({
  onInsertTemplate,
  templates,
  selectedTemplateId,
  onTemplateChange,
  hasTemplateContent,
  onOpenGallery,
  onManageTemplates,
  onModelSelect,
  showModelPicker = false,
}: ChatToolbarProps) {
  const { t } = useLanguage()
  const chatModelPref = useModelPref('chat')

  const handleOpenGallery = () => {
    if (onOpenGallery) {
      onOpenGallery()
    }
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)
  const selectedTemplateLabel = selectedTemplate?.label || t.chat.insertTemplate
  const insertTemplateLabel = `${t.chat.insertTemplate}：${selectedTemplateLabel}`

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {templates.length > 0 ? (
        <div className="flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border bg-background shadow-xs sm:max-w-[14rem]">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            data-testid="chat-template-insert"
            aria-label={insertTemplateLabel}
            title={insertTemplateLabel}
            className="h-full min-w-0 flex-1 justify-start gap-2 rounded-none px-2.5 text-xs font-medium hover:bg-accent"
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="hidden truncate sm:inline">{selectedTemplateLabel}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                data-testid="chat-template-menu"
                aria-label={t.chat.selectTemplate}
                title={t.chat.selectTemplate}
                className="h-full w-9 shrink-0 rounded-none border-l bg-muted/30 hover:bg-accent"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuRadioGroup value={selectedTemplateId} onValueChange={onTemplateChange}>
                {templates.map((template) => (
                  <DropdownMenuRadioItem key={template.id} value={template.id} className="cursor-pointer">
                    <span className="min-w-0 flex-1 truncate">{template.label}</span>
                    {template.shortcut ? (
                      <DropdownMenuShortcut className="font-mono tracking-normal">
                        /{template.shortcut}
                      </DropdownMenuShortcut>
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {onOpenGallery && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenGallery}
          data-testid="chat-template-gallery"
          aria-label={t.promptGallery.browseGallery}
          title={t.promptGallery.browseGallery}
          className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
        >
          <Library className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">{t.chat.templateGallery}</span>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onManageTemplates}
        data-testid="chat-template-manage"
        aria-label={t.chat.manageTemplates}
        title={t.chat.manageTemplates}
        className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">{t.chat.manageTemplates}</span>
      </Button>
      {showModelPicker && (
        <div className="ml-auto flex h-9 shrink-0 items-center">
          <ModelPicker
            modelId={chatModelPref}
            fallbackModelId={MODEL_PREF_DEFAULTS.chat}
            onSelect={onModelSelect}
            tooltip={t.modelPicker.chatTooltip}
            compact
            align="end"
            agentModeActive
          />
        </div>
      )}
    </div>
  )
}
