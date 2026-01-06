// Custom Hook: Auto-generate Insights
import { useState, useEffect } from 'react'

interface Panel {
  id: string
  autoGenerate?: boolean
}

interface UseAutoGenerateProps {
  panels: Panel[]
  canGenerate: boolean
  context: string
  runPanel: (panelId: string) => Promise<void>
}

export function useAutoGenerate({
  panels,
  canGenerate,
  context,
  runPanel,
}: UseAutoGenerateProps) {
  const [autoRunPanels, setAutoRunPanels] = useState<Set<string>>(new Set())

  // Reset autoRunPanels when context changes
  useEffect(() => {
    setAutoRunPanels(new Set())
  }, [context])

  // Auto-run panels with autoGenerate enabled when conditions are met
  useEffect(() => {
    if (!canGenerate || !context.trim() || panels.length === 0) {
      return
    }

    const panelsToAutoRun = panels.filter(
      (panel) => panel.autoGenerate === true && !autoRunPanels.has(panel.id)
    )
    if (panelsToAutoRun.length === 0) {
      return
    }

    // Mark these panels as auto-run
    setAutoRunPanels((prev) => {
      const next = new Set(prev)
      panelsToAutoRun.forEach((panel) => next.add(panel.id))
      return next
    })

    const autoRun = async () => {
      await Promise.all(panelsToAutoRun.map((panel) => runPanel(panel.id)))
    }

    autoRun().catch((error) => {
      console.error("Failed to auto-run clinical insights", error)
      // Remove failed panels from the set so they can be retried
      setAutoRunPanels((prev) => {
        const next = new Set(prev)
        panelsToAutoRun.forEach((panel) => next.delete(panel.id))
        return next
      })
    })
  }, [canGenerate, context, autoRunPanels, panels, runPanel])

  return { autoRunPanels, setAutoRunPanels }
}
