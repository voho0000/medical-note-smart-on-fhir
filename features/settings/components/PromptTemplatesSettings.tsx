// Refactored Prompt Templates Settings
"use client"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { usePromptTemplates } from "@/src/application/providers/prompt-templates.provider"
import { TemplateEditor } from './TemplateEditor'

export function PromptTemplatesSettings() {
  const { t } = useLanguage()
  const { templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, maxTemplates } = usePromptTemplates()

  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-tight">{t.settings.promptTemplatesTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {t.settings.promptTemplatesDesc}
        </p>
      </div>

      <div className="space-y-4">
        {templates.map((template, index) => (
          <TemplateEditor
            key={template.id}
            template={template}
            index={index}
            canRemove={canRemoveTemplate}
            onUpdate={updateTemplate}
            onRemove={removeTemplate}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={addTemplate} disabled={!canAddTemplate}>
          {t.settings.addTemplate}
        </Button>
        <Button type="button" variant="ghost" onClick={resetTemplates}>
          {t.settings.resetDefaults}
        </Button>
        <span className="text-xs text-muted-foreground">
          {templates.length}/{maxTemplates} {t.settings.templatesAvailable}
        </span>
      </div>
    </div>
  )
}
