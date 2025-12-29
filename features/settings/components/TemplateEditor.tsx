// Template Editor Component
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface Template {
  id: string
  label: string
  description?: string
  content: string
}

interface TemplateEditorProps {
  template: Template
  index: number
  canRemove: boolean
  onUpdate: (id: string, updates: Partial<Template>) => void
  onRemove: (id: string) => void
}

export function TemplateEditor({ template, index, canRemove, onUpdate, onRemove }: TemplateEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Template {index + 1}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{template.content.length} chars</span>
          {canRemove && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRemove(template.id)}
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
            onChange={(event) => onUpdate(template.id, { label: event.target.value })}
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
            onChange={(event) => onUpdate(template.id, { description: event.target.value })}
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
            onChange={(event) => onUpdate(template.id, { content: event.target.value })}
            placeholder="Describe what you want the assistant to produce."
            className="min-h-[120px] resize-vertical text-sm"
          />
        </div>
      </div>
    </div>
  )
}
