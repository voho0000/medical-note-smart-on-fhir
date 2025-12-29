// Insight Tab Editor Component
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface InsightPanel {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

interface InsightTabEditorProps {
  panel: InsightPanel
  index: number
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onUpdate: (id: string, updates: Partial<InsightPanel>) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: "up" | "down") => void
}

export function InsightTabEditor({
  panel,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onRemove,
  onMove,
}: InsightTabEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Tab {index + 1}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Order controls:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMove(panel.id, "up")}
              disabled={!canMoveUp}
              aria-label={`Move tab ${index + 1} up`}
            >
              ↑ Move up
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMove(panel.id, "down")}
              disabled={!canMoveDown}
              aria-label={`Move tab ${index + 1} down`}
            >
              ↓ Move down
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(panel.id)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase text-muted-foreground">Tab label</label>
          <Input
            value={panel.title}
            onChange={(event) => onUpdate(panel.id, { title: event.target.value })}
            placeholder="Safety Flag"
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase text-muted-foreground">Subtitle (optional)</label>
          <Input
            value={panel.subtitle ?? ""}
            onChange={(event) => onUpdate(panel.id, { subtitle: event.target.value })}
            placeholder="Highlight urgent safety issues or contraindications."
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase text-muted-foreground">Prompt</label>
          <Textarea
            value={panel.prompt}
            onChange={(event) => onUpdate(panel.id, { prompt: event.target.value })}
            className="min-h-[140px] resize-vertical text-sm"
            placeholder="Describe what this insight should produce using the available clinical context."
          />
        </div>
      </div>
    </div>
  )
}
