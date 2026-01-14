// Chat Templates Settings
"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"
import { TemplateEditor } from './TemplateEditor'

export function ChatTemplatesSettings() {
  const { t } = useLanguage()
  const { templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, saveTemplates, maxTemplates, isSaving, moveTemplate } = useChatTemplates()

  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  const defaultTab = templates[0]?.id || ""

  const handleMove = (id: string, direction: "up" | "down") => {
    const currentIndex = templates.findIndex(t => t.id === id)
    if (currentIndex === -1) return
    
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= templates.length) return
    
    moveTemplate(currentIndex, newIndex)
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
        <Tabs defaultValue={defaultTab} className="space-y-4 overflow-hidden">
          <div className="flex items-center gap-2 w-full">
            <TabsList className="flex flex-1 flex-nowrap gap-1 rounded-md bg-muted/50 p-1 min-w-0 w-full h-9 border">
              {templates.map((template, index) => (
                <TabsTrigger
                  key={template.id}
                  value={template.id}
                  className="flex-1 min-w-[40px] px-2 py-1 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  {index + 1}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addTemplate}
              disabled={!canAddTemplate}
              className="h-9 w-9 shrink-0 p-0 border-2 border-primary/50 hover:border-primary hover:bg-primary/10 text-lg font-semibold"
            >
              +
            </Button>
          </div>
          {templates.map((template, index) => (
            <TabsContent key={template.id} value={template.id} className="mt-0">
              <TemplateEditor
                template={template}
                index={index}
                canRemove={canRemoveTemplate}
                canMoveUp={index > 0}
                canMoveDown={index < templates.length - 1}
                onUpdate={updateTemplate}
                onRemove={removeTemplate}
                onMove={handleMove}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button 
          type="button" 
          variant="default" 
          onClick={saveTemplates}
          disabled={isSaving}
          className="bg-primary hover:bg-primary/90"
        >
          {isSaving ? t.settings.saving : t.settings.saveTemplates}
        </Button>
        <Button type="button" variant="outline" onClick={resetTemplates} className="border-2 border-primary/50 hover:border-primary hover:bg-primary/10">
          {t.settings.resetDefaults}
        </Button>
        <span className="text-xs text-muted-foreground">
          {templates.length}/{maxTemplates} {t.settings.templatesAvailable}
        </span>
      </div>
    </div>
  )
}
