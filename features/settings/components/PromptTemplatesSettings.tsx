// Refactored Prompt Templates Settings
"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { usePromptTemplates } from "@/src/application/providers/prompt-templates.provider"
import { TemplateEditor } from './TemplateEditor'

export function PromptTemplatesSettings() {
  const { t } = useLanguage()
  const { templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, maxTemplates } = usePromptTemplates()

  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  const defaultTab = templates[0]?.id || ""

  const handleMove = () => {
    // Order adjustment not implemented yet
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-tight">{t.settings.promptTemplatesTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {t.settings.promptTemplatesDesc}
        </p>
      </div>

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
