"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { usePromptTemplates } from "@/features/medical-chat/context/PromptTemplatesContext"

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
          <div key={template.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Template {index + 1}</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {template.content.length} chars
                </span>
                {canRemoveTemplate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeTemplate(template.id)}
                    className="text-xs"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-label-${template.id}`}>
                  Label
                </Label>
                <Input
                  id={`template-label-${template.id}`}
                  value={template.label}
                  onChange={(event) => updateTemplate(template.id, { label: event.target.value })}
                  placeholder="e.g., Summary of Visit"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-description-${template.id}`}>
                  Description (optional)
                </Label>
                <Input
                  id={`template-description-${template.id}`}
                  value={template.description ?? ""}
                  onChange={(event) => updateTemplate(template.id, { description: event.target.value })}
                  placeholder="Short hint for when to use this prompt"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-content-${template.id}`}>
                  Prompt
                </Label>
                <Textarea
                  id={`template-content-${template.id}`}
                  value={template.content}
                  onChange={(event) => updateTemplate(template.id, { content: event.target.value })}
                  placeholder="Describe what you want the assistant to produce."
                  className="min-h-[120px] resize-vertical text-sm"
                />
              </div>
            </div>
          </div>
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
