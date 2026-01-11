/**
 * Custom Hook: Insight Panels Prompts Management
 * 
 * Single Responsibility: Manage prompts only
 * State ownership: Does NOT own responses or panelStatus
 * Those are owned by useInsightGeneration
 */
import { useCallback, useMemo } from 'react'

interface Panel {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

export function useInsightPanels(panels: Panel[], onPromptUpdate?: (panelId: string, prompt: string) => void) {
  // Resolve prompts from panels configuration
  const resolvedPrompts = useMemo(() => {
    return panels.reduce<Record<string, string>>((acc, panel) => {
      acc[panel.id] = panel.prompt
      return acc
    }, {})
  }, [panels])

  // Handle prompt changes (delegates to parent)
  const handlePromptChange = useCallback((panelId: string, value: string) => {
    if (onPromptUpdate) {
      onPromptUpdate(panelId, value)
    }
  }, [onPromptUpdate])

  return {
    prompts: resolvedPrompts,
    handlePromptChange,
  }
}
