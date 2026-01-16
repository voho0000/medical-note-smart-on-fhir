// Chat Templates Settings
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info, Library, Lock } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"
import { TemplateEditor } from './TemplateEditor'
import { PromptGalleryDialog, SharePromptDialog } from "@/features/prompt-gallery"
import { LoginRequiredDialog } from "@/features/prompt-gallery/components/LoginRequiredDialog"
import type { SharedPrompt } from "@/features/prompt-gallery"

export function ChatTemplatesSettings() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, saveTemplates, maxTemplates, isSaving, moveTemplate } = useChatTemplates()

  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  const [activeTab, setActiveTab] = useState(templates[0]?.id || "")
  const [showPromptGallery, setShowPromptGallery] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [templateToShare, setTemplateToShare] = useState<{ label: string; content: string } | null>(null)

  const handleAddTemplate = () => {
    const newTemplateId = addTemplate()
    if (newTemplateId) {
      setActiveTab(newTemplateId)
    }
  }

  const handleRemoveTemplate = (id: string) => {
    removeTemplate(id)
    // Switch to first template after deletion
    if (templates.length > 1) {
      const remainingTemplates = templates.filter(t => t.id !== id)
      if (remainingTemplates.length > 0) {
        setActiveTab(remainingTemplates[0].id)
      }
    }
  }

  const handleMove = (id: string, direction: "up" | "down") => {
    const currentIndex = templates.findIndex(t => t.id === id)
    if (currentIndex === -1) return
    
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= templates.length) return
    
    moveTemplate(currentIndex, newIndex)
  }

  const handleSelectPrompt = (prompt: SharedPrompt, useAs?: 'chat' | 'insight') => {
    // Only add to chat templates if useAs is 'chat' or undefined (default)
    if (useAs === 'insight') {
      // If user wants to use as insight, do nothing here
      // (they should use it from Clinical Insights page)
      return
    }
    
    // Add prompt as a new template
    if (canAddTemplate) {
      const newTemplateId = addTemplate()
      if (newTemplateId) {
        updateTemplate(newTemplateId, {
          label: prompt.title,
          content: prompt.prompt,
        })
        setActiveTab(newTemplateId)
      }
    }
  }

  const handleShareTemplate = (template: { label: string; content: string }) => {
    setTemplateToShare(template)
    setShowShareDialog(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold leading-tight">{t.settings.chatTemplatesTitle}</h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
              <p className="text-xs">
                {t.settings.chatTemplatesLanguageWarning}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.settings.chatTemplatesDesc}
      </p>

      {templates.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 w-full">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="選擇範本" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {templates.map((template, index) => (
                  <SelectItem key={template.id} value={template.id}>
                    {index + 1}. {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddTemplate}
              disabled={!canAddTemplate}
              className="h-10 w-10 shrink-0 p-0 border-2 border-primary/50 hover:border-primary hover:bg-primary/10 text-lg font-semibold"
            >
              +
            </Button>
          </div>
          {templates.map((template, index) => (
            <div key={template.id} className={activeTab === template.id ? "block" : "hidden"}>
              <TemplateEditor
                template={template}
                index={index}
                canRemove={canRemoveTemplate}
                canMoveUp={index > 0}
                canMoveDown={index < templates.length - 1}
                onUpdate={updateTemplate}
                onRemove={handleRemoveTemplate}
                onMove={handleMove}
                onShare={handleShareTemplate}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                type="button" 
                variant="default" 
                onClick={() => {
                  if (!user) {
                    setShowLoginDialog(true)
                    return
                  }
                  saveTemplates()
                }}
                disabled={isSaving}
                className={user 
                  ? "bg-primary hover:bg-primary/90"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }
              >
                {!user && <Lock className="h-4 w-4 mr-2" />}
                {isSaving ? t.settings.saving : t.settings.saveTemplates}
              </Button>
            </TooltipTrigger>
            {!user && (
              <TooltipContent>
                <p>請先登入以儲存模板</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => setShowPromptGallery(true)}
          disabled={!canAddTemplate}
          className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10"
        >
          <Library className="h-4 w-4 mr-2" />
          {t.promptGallery.browseGallery}
        </Button>
        <Button type="button" variant="outline" onClick={resetTemplates} className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10">
          {t.settings.resetDefaults}
        </Button>
      </div>

      <PromptGalleryDialog
        open={showPromptGallery}
        onOpenChange={setShowPromptGallery}
        mode="chat"
        onSelectPrompt={handleSelectPrompt}
      />

      <SharePromptDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        initialTitle={templateToShare?.label || ''}
        initialPrompt={templateToShare?.content || ''}
        initialType="chat"
      />
    </div>
  )
}
