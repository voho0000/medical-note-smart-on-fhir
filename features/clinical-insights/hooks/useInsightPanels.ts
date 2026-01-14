/**
 * Custom Hook: Insight Panels Prompts Management
 * 
 * Single Responsibility: Manage prompts only
 * State ownership: Does NOT own responses or panelStatus
 * Those are owned by useInsightGeneration
 */
import { useCallback, useMemo, useState } from 'react'

interface Panel {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

export function useInsightPanels(panels: Panel[], onPromptUpdate?: (panelId: string, prompt: string) => void) {
  // Local state for temporary prompt edits
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({})

  // Resolve prompts: use local edits if available, otherwise use panel defaults
  const resolvedPrompts = useMemo(() => {
    return panels.reduce<Record<string, string>>((acc, panel) => {
      acc[panel.id] = localPrompts[panel.id] ?? panel.prompt
      return acc
    }, {})
  }, [panels, localPrompts])

  // Handle prompt changes (stores locally, does not persist)
  const handlePromptChange = useCallback((panelId: string, value: string) => {
    setLocalPrompts(prev => ({
      ...prev,
      [panelId]: value
    }))
  }, [])

  return {
    prompts: resolvedPrompts,
    handlePromptChange,
  }
}
