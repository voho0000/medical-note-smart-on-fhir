// Custom Hook: Insight Panels State Management
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ResponseEntry, PanelStatus } from '../types'

interface Panel {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

interface UseInsightPanelsProps {
  panels: Panel[]
  onPromptUpdate?: (panelId: string, prompt: string) => void
}

export function useInsightPanels(panels: Panel[], onPromptUpdate?: (panelId: string, prompt: string) => void) {
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({})
  const [panelStatus, setPanelStatus] = useState<Record<string, PanelStatus>>({})

  // Initialize state when panels change
  useEffect(() => {
    setResponses((prev) => {
      return panels.reduce<Record<string, ResponseEntry>>((acc, panel) => {
        const existing = prev[panel.id]
        const text = typeof existing?.text === "string" ? existing.text : ""
        const isEdited = existing?.isEdited ?? false
        const metadata = existing?.metadata ?? null
        acc[panel.id] = { text, isEdited, metadata }
        return acc
      }, {})
    })

    setPanelStatus((prev) => {
      return panels.reduce<Record<string, PanelStatus>>((acc, panel) => {
        acc[panel.id] = prev[panel.id] ?? { isLoading: false, error: null }
        return acc
      }, {})
    })
  }, [panels])

  const resolvedPrompts = useMemo(() => {
    return panels.reduce<Record<string, string>>((acc, panel) => {
      acc[panel.id] = panel.prompt
      return acc
    }, {})
  }, [panels])

  const handlePromptChange = useCallback((panelId: string, value: string) => {
    if (onPromptUpdate) {
      onPromptUpdate(panelId, value)
    }
  }, [onPromptUpdate])

  const handleResponseChange = useCallback((panelId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { text: value, isEdited: true, metadata: prev[panelId]?.metadata ?? null },
    }))
  }, [])

  const resetEditedFlags = useCallback(() => {
    setResponses((prev) => {
      return Object.keys(prev).reduce<Record<string, ResponseEntry>>((acc, panelId) => {
        acc[panelId] = { text: prev[panelId].text, isEdited: false, metadata: prev[panelId].metadata ?? null }
        return acc
      }, {})
    })
  }, [])

  return {
    prompts: resolvedPrompts,
    responses,
    panelStatus,
    setResponses,
    setPanelStatus,
    handlePromptChange,
    handleResponseChange,
    resetEditedFlags,
  }
}
