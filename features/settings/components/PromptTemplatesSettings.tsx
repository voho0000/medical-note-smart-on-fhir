// Refactored Prompt Templates Settings
"use client"

import { Button } from "@/components/ui/button"
import { usePromptTemplates } from "@/src/application/providers/prompt-templates.provider"
import { TemplateEditor } from './TemplateEditor'

export function PromptTemplatesSettings() {
  const { templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, maxTemplates } = usePromptTemplates()

  const canAddTemplate = templates.length < maxTemplates
  const canRemoveTemplate = templates.length > 1

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-tight">Prompt Templates</h3>
        <p className="text-xs text-muted-foreground">
          Create reusable prompts to speed up note drafting. Templates are stored locally in this browser.
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
          Add template
        </Button>
        <Button type="button" variant="ghost" onClick={resetTemplates}>
          Reset defaults
        </Button>
        <span className="text-xs text-muted-foreground">
          {templates.length}/{maxTemplates} templates available.
        </span>
      </div>
    </div>
  )
}
