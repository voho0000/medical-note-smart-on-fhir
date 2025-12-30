// Template Editor Component
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/src/application/providers/language.provider"

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
  canMoveUp: boolean
  canMoveDown: boolean
  onUpdate: (id: string, updates: Partial<Template>) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: "up" | "down") => void
}

export function TemplateEditor({ 
  template, 
  index, 
  canRemove, 
  canMoveUp,
  canMoveDown,
  onUpdate, 
  onRemove,
  onMove
}: TemplateEditorProps) {
  const { t } = useLanguage()
  
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t.settings.template} {index + 1}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t.settings.orderControls}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMove(template.id, "up")}
              disabled={!canMoveUp}
              aria-label={`Move template ${index + 1} up`}
            >
              {t.settings.moveUp}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMove(template.id, "down")}
              disabled={!canMoveDown}
              aria-label={`Move template ${index + 1} down`}
            >
              {t.settings.moveDown}
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          {canRemove && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRemove(template.id)}
              className="border-2 border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10"
            >
              {t.settings.remove}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-label-${template.id}`}>
            {t.settings.label}
          </Label>
          <Input
            id={`template-label-${template.id}`}
            value={template.label}
            onChange={(event) => onUpdate(template.id, { label: event.target.value })}
            placeholder={t.settings.labelPlaceholder}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-description-${template.id}`}>
            {t.settings.descriptionOptional}
          </Label>
          <Input
            id={`template-description-${template.id}`}
            value={template.description ?? ""}
            onChange={(event) => onUpdate(template.id, { description: event.target.value })}
            placeholder={t.settings.descriptionPlaceholder}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs uppercase text-muted-foreground" htmlFor={`template-content-${template.id}`}>
            {t.settings.prompt}
          </Label>
          <Textarea
            id={`template-content-${template.id}`}
            value={template.content}
            onChange={(event) => onUpdate(template.id, { content: event.target.value })}
            placeholder={t.settings.promptPlaceholder}
            className="min-h-[60px] resize-vertical text-sm"
          />
        </div>
      </div>
    </div>
  )
}
