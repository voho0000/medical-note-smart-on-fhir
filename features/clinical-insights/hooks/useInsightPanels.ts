// Custom Hook: Insight Panels State Management
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ResponseEntry, PanelStatus } from '../types'

interface Panel {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

export function useInsightPanels(panels: Panel[]) {
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({})
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({})
  const [panelStatus, setPanelStatus] = useState<Record<string, PanelStatus>>({})

  // Initialize state when panels change
  useEffect(() => {
    setPromptOverrides((prev) => {
      const validIds = new Set(panels.map((panel) => panel.id))
      return Object.keys(prev).reduce<Record<string, string>>((acc, key) => {
        if (validIds.has(key)) {
          acc[key] = prev[key]
        }
        return acc
      }, {})
    })

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
      acc[panel.id] = promptOverrides[panel.id] ?? panel.prompt
      return acc
    }, {})
  }, [panels, promptOverrides])

  const handlePromptChange = useCallback((panelId: string, value: string) => {
    setPromptOverrides((prev) => {
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return prev

      if (value === panel.prompt) {
        if (!(panelId in prev)) return prev
        const { [panelId]: _, ...rest } = prev
        return rest
      }

      return { ...prev, [panelId]: value }
    })
  }, [panels])

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
