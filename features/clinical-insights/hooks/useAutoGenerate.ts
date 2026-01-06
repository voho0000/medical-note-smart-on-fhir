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
  const [hasAutoRun, setHasAutoRun] = useState(false)

  // Reset hasAutoRun when context changes
  useEffect(() => {
    setHasAutoRun(false)
  }, [context])

  // Auto-run panels with autoGenerate enabled when conditions are met
  useEffect(() => {
    if (!canGenerate || hasAutoRun || !context.trim() || panels.length === 0) {
      return
    }

    const panelsToAutoRun = panels.filter((panel) => panel.autoGenerate === true)
    if (panelsToAutoRun.length === 0) {
      return
    }

    setHasAutoRun(true)

    const autoRun = async () => {
      await Promise.all(panelsToAutoRun.map((panel) => runPanel(panel.id)))
    }

    autoRun().catch((error) => {
      console.error("Failed to auto-run clinical insights", error)
      setHasAutoRun(false)
    })
  }, [canGenerate, context, hasAutoRun, panels, runPanel])

  return { hasAutoRun, setHasAutoRun }
}
