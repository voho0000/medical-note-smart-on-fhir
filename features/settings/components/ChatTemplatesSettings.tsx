// Chat Templates Manager
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
  FileText,
  HardDrive,
  Library,
  Plus,
  RotateCcw,
  Save,
  Star,
  Stethoscope,
  User,
} from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"
import { cn } from "@/src/shared/utils/cn.utils"
import { InfoHint } from "@/src/shared/components/InfoHint"
import { TemplateEditor } from "./TemplateEditor"
import { PromptGalleryDialog, SharePromptDialog } from "@/features/prompt-gallery"
import type { PromptType, SharedPrompt } from "@/features/prompt-gallery"
import { useTemplateSelector } from "@/features/medical-chat/hooks/useTemplateSelector"

interface ChatTemplatesSettingsProps {
  initialTemplateId?: string
}

export function ChatTemplatesSettings({ initialTemplateId }: ChatTemplatesSettingsProps = {}) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()
  const {
    templates,
    addTemplate,
    updateTemplate,
    removeTemplate,
    resetTemplates,
    saveTemplates,
    maxTemplates,
    isSaving,
    moveTemplate,
  } = useChatTemplates()
  const { selectedTemplateId, setAsDefault } = useTemplateSelector()

  const audienceLabel = audience === "medical" ? t.audience.medical : t.audience.patient
  const AudienceIcon = audience === "medical" ? Stethoscope : User
  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  const [activeId, setActiveId] = useState(initialTemplateId || selectedTemplateId || templates[0]?.id || "")
  const [showPromptGallery, setShowPromptGallery] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [templateToShare, setTemplateToShare] = useState<{ label: string; content: string } | null>(null)

  const resolvedActiveId = templates.some((template) => template.id === activeId)
    ? activeId
    : (templates[0]?.id ?? "")
  const activeTemplate = templates.find((template) => template.id === resolvedActiveId)
  const activeIndex = activeTemplate ? templates.findIndex((template) => template.id === activeTemplate.id) : -1

  const handleAddTemplate = () => {
    const newTemplateId = addTemplate()
    if (newTemplateId) setActiveId(newTemplateId)
  }

  const handleRemoveTemplate = (id: string) => {
    const remaining = templates.filter((template) => template.id !== id)
    removeTemplate(id)
    if (resolvedActiveId === id) setActiveId(remaining[0]?.id ?? "")
  }

  const handleMove = (id: string, direction: "up" | "down") => {
    const currentIndex = templates.findIndex((template) => template.id === id)
    if (currentIndex === -1) return
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= templates.length) return
    moveTemplate(currentIndex, targetIndex)
  }

  const handleSelectPrompt = (prompt: SharedPrompt, useAs?: PromptType) => {
    if (useAs === "summary" || !canAddTemplate) return
    const newTemplateId = addTemplate()
    if (!newTemplateId) return
    updateTemplate(newTemplateId, { label: prompt.title, content: prompt.prompt })
    setActiveId(newTemplateId)
    setShowPromptGallery(false)
    if (user) window.setTimeout(() => void saveTemplates(), 200)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm">
              <AudienceIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground">{audienceLabel}</p>
                <InfoHint side="right">
                  <p className="max-w-xs text-xs">{t.settings.chatTemplatesLanguageWarning}</p>
                </InfoHint>
              </div>
              <p className="text-[0.625rem] text-muted-foreground">{t.settings.chatTemplateAudienceShort}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-[0.625rem] font-medium text-muted-foreground">
              <FileText className="h-3 w-3 text-primary" />
              {templates.length}/{maxTemplates} {t.settings.templatesInUse}
            </span>
            {selectedTemplateId ? (
              <span className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border bg-background px-2 py-1 text-[0.625rem] font-medium text-muted-foreground">
                <Star className="h-3 w-3 fill-primary text-primary" />
                <span className="truncate">{templates.find((template) => template.id === selectedTemplateId)?.label}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:hidden">
        <Select value={resolvedActiveId} onValueChange={setActiveId}>
          <SelectTrigger className="h-9 min-w-0 flex-1">
            <SelectValue placeholder={t.settings.templateSelectPlaceholder} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            {templates.map((template, index) => (
              <SelectItem key={template.id} value={template.id}>{index + 1}. {template.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={handleAddTemplate} disabled={!canAddTemplate} aria-label={t.settings.addTemplate} title={t.settings.addTemplate}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden rounded-xl border bg-muted/10 sm:block">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{t.settings.templateListTitle}</p>
              <p className="text-[0.625rem] text-muted-foreground">{templates.length} {t.settings.templatesInUse}</p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={handleAddTemplate} disabled={!canAddTemplate} aria-label={t.settings.addTemplate} title={t.settings.addTemplate}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <nav className="max-h-[26rem] space-y-1 overflow-y-auto p-2" aria-label={t.settings.templateListTitle}>
            {templates.map((template, index) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setActiveId(template.id)}
                className={cn(
                  "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                  template.id === resolvedActiveId
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-transparent hover:border-border hover:bg-background",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.625rem] font-semibold",
                    template.id === resolvedActiveId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" title={template.label}>{template.label}</p>
                    <div className="mt-1 flex items-center gap-1 text-[0.5625rem] text-muted-foreground">
                      {template.id === selectedTemplateId ? <Star className="h-3 w-3 fill-primary text-primary" /> : null}
                      {template.shortcut ? <span className="truncate font-mono">/{template.shortcut}</span> : <span>{t.settings.noShortcut}</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </nav>

          <div className="space-y-1 border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs" onClick={() => setShowPromptGallery(true)} disabled={!canAddTemplate}>
              <Library className="h-3.5 w-3.5 text-primary" />
              {t.promptGallery.browseGallery}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground" onClick={() => void resetTemplates()}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t.settings.resetToDefaults}
            </Button>
          </div>
        </aside>

        <div className="min-w-0">
          {activeTemplate && activeIndex >= 0 ? (
            <TemplateEditor
              template={activeTemplate}
              index={activeIndex}
              canRemove={canRemoveTemplate}
              canMoveUp={activeIndex > 0}
              canMoveDown={activeIndex < templates.length - 1}
              isDefault={activeTemplate.id === selectedTemplateId}
              onUpdate={updateTemplate}
              onRemove={handleRemoveTemplate}
              onMove={handleMove}
              onShare={(template) => {
                setTemplateToShare({ label: template.label, content: template.content })
                setShowShareDialog(true)
              }}
              onSetAsDefault={setAsDefault}
            />
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-5 w-5 text-primary/60" />
              {t.settings.templateSelectPlaceholder}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          {user ? <Cloud className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
          {user ? t.settings.templateAccountSync : t.settings.templateBrowserAutosave}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs sm:hidden" onClick={() => setShowPromptGallery(true)} disabled={!canAddTemplate}>
            <Library className="h-3.5 w-3.5" />
            {t.promptGallery.browseGallery}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground sm:hidden" onClick={() => void resetTemplates()}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t.settings.resetToDefaults}
          </Button>
          {user ? (
            <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void saveTemplates()} disabled={isSaving}>
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t.settings.saving : t.settings.saveTemplates}
            </Button>
          ) : null}
        </div>
      </div>

      <PromptGalleryDialog open={showPromptGallery} onOpenChange={setShowPromptGallery} mode="chat" onSelectPrompt={handleSelectPrompt} />
      <SharePromptDialog open={showShareDialog} onOpenChange={setShowShareDialog} initialTitle={templateToShare?.label || ""} initialPrompt={templateToShare?.content || ""} initialType="chat" />
    </div>
  )
}
