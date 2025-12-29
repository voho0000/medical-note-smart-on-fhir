// Refactored Clinical Insights Settings
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { InsightTabEditor } from './InsightTabEditor'

export function ClinicalInsightsSettings() {
  const { 
    panels, 
    updatePanel, 
    addPanel, 
    removePanel, 
    resetPanels, 
    maxPanels, 
    reorderPanels, 
    autoGenerate, 
    setAutoGenerate 
  } = useClinicalInsightsConfig()

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
        {/* Auto-generate Toggle */}
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
              When enabled, Clinical Insights will automatically generate responses when you enter the page. 
              When disabled, you'll need to manually trigger generation for each tab.
            </p>
          </div>
        </div>

        {/* Insight Tabs */}
        {panels.map((panel, index) => (
          <InsightTabEditor
            key={panel.id}
            panel={panel}
            index={index}
            canRemove={canRemovePanel}
            canMoveUp={index > 0}
            canMoveDown={index < panels.length - 1}
            onUpdate={updatePanel}
            onRemove={removePanel}
            onMove={handleMove}
          />
        ))}

        {/* Actions */}
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
