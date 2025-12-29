// Custom Hook: Auto-generate Insights
import { useState, useEffect } from 'react'

interface Panel {
  id: string
}

interface UseAutoGenerateProps {
  panels: Panel[]
  autoGenerate: boolean
  canGenerate: boolean
  context: string
  runPanel: (panelId: string) => Promise<void>
}

export function useAutoGenerate({
  panels,
  autoGenerate,
  canGenerate,
  context,
  runPanel,
}: UseAutoGenerateProps) {
  const [hasAutoRun, setHasAutoRun] = useState(false)

  // Reset hasAutoRun when context changes
  useEffect(() => {
    setHasAutoRun(false)
  }, [context])

  // Auto-run when conditions are met
  useEffect(() => {
    if (!canGenerate || hasAutoRun || !context.trim() || panels.length === 0 || !autoGenerate) {
      return
    }

    setHasAutoRun(true)

    const autoRun = async () => {
      await Promise.all(panels.map((panel) => runPanel(panel.id)))
    }

    autoRun().catch((error) => {
      console.error("Failed to auto-run clinical insights", error)
      setHasAutoRun(false)
    })
  }, [canGenerate, context, hasAutoRun, panels, runPanel, autoGenerate])

  return { hasAutoRun, setHasAutoRun }
}
