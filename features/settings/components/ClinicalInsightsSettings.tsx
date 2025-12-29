"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"

export function ClinicalInsightsSettings() {
  const { panels, updatePanel, addPanel, removePanel, resetPanels, maxPanels, reorderPanels, autoGenerate, setAutoGenerate } =
    useClinicalInsightsConfig()

  const canAddPanel = panels.length < maxPanels
  const canRemovePanel = panels.length > 1

  const handleMove = (panelId: string, direction: "up" | "down") => {
    const currentIndex = panels.findIndex((panel) => panel.id === panelId)
    if (currentIndex === -1) return

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= panels.length) return

    const orderIds = [...panels.map((panel) => panel.id)]
    const [removed] = orderIds.splice(currentIndex, 1)
    orderIds.splice(targetIndex, 0, removed)
    reorderPanels(orderIds)
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Clinical Insights Settings</CardTitle>
        <p className="text-xs text-muted-foreground">
          Configure auto-generation behavior and customize the tabs that appear in Clinical Insights.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center space-x-2 rounded-lg border p-4">
          <Checkbox
            id="auto-generate"
            checked={autoGenerate}
            onCheckedChange={(checked) => setAutoGenerate(checked as boolean)}
          />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="auto-generate"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Auto-generate insights on page load
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, Clinical Insights will automatically generate responses when you enter the page. When disabled, you'll need to manually trigger generation for each tab.
            </p>
          </div>
        </div>
        {panels.map((panel, index) => (
          <div key={panel.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Tab {index + 1}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Order controls:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove(panel.id, "up")}
                    disabled={index === 0}
                    aria-label={`Move tab ${index + 1} up`}
                  >
                    ↑ Move up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove(panel.id, "down")}
                    disabled={index === panels.length - 1}
                    aria-label={`Move tab ${index + 1} down`}
                  >
                    ↓ Move down
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                {canRemovePanel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePanel(panel.id)}
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
                  onChange={(event) => updatePanel(panel.id, { title: event.target.value })}
                  placeholder="Safety Flag"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium uppercase text-muted-foreground">Subtitle (optional)</label>
                <Input
                  value={panel.subtitle ?? ""}
                  onChange={(event) => updatePanel(panel.id, { subtitle: event.target.value })}
                  placeholder="Highlight urgent safety issues or contraindications."
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium uppercase text-muted-foreground">Prompt</label>
                <Textarea
                  value={panel.prompt}
                  onChange={(event) => updatePanel(panel.id, { prompt: event.target.value })}
                  className="min-h-[140px] resize-vertical text-sm"
                  placeholder="Describe what this insight should produce using the available clinical context."
                />
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={addPanel} disabled={!canAddPanel}>
            Add tab
          </Button>
          <Button type="button" variant="ghost" onClick={resetPanels}>
            Reset to defaults
          </Button>
          <span className="text-xs text-muted-foreground">
            {panels.length}/{maxPanels} tabs in use. Edits are saved to this browser.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default ClinicalInsightsSettings
