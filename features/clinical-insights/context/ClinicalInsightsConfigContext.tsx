"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type InsightPanelConfig = {
  id: string
  title: string
  subtitle?: string
  prompt: string
}

const DEFAULT_PANELS: InsightPanelConfig[] = [
  {
    id: "safety",
    title: "Safety Flag",
    subtitle: "Highlight urgent safety issues or contraindications.",
    prompt:
      "Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.",
  },
  {
    id: "changes",
    title: "What's Changed",
    subtitle: "Summarize notable changes compared to prior data or visits.",
    prompt:
      "Compare the patient's recent clinical data to prior information and list the most important changes in status, therapy, or results. Emphasize deltas that require attention.",
  },
  {
    id: "snapshot",
    title: "Clinical Snapshot",
    subtitle: "Provide a concise overview of the current clinical picture.",
    prompt:
      "Create a succinct clinical snapshot covering active problems, current therapies, recent results, and outstanding tasks. Keep it brief and actionable.",
  },
]

const STORAGE_KEY = "clinical-insights-panels"
const MAX_PANELS = 6

function generatePanelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `panel_${Math.random().toString(36).slice(2, 10)}`
}

export function getDefaultClinicalInsightPanels(): InsightPanelConfig[] {
  return DEFAULT_PANELS.map((panel) => ({ ...panel }))
}

type ClinicalInsightsConfigContextValue = {
  panels: InsightPanelConfig[]
  addPanel: () => void
  updatePanel: (id: string, patch: Partial<InsightPanelConfig>) => void
  removePanel: (id: string) => void
  resetPanels: () => void
  maxPanels: number
  reorderPanels: (orderedIds: string[]) => void
}

const ClinicalInsightsConfigContext = createContext<ClinicalInsightsConfigContextValue | null>(null)

export function ClinicalInsightsConfigProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState<InsightPanelConfig[]>(getDefaultClinicalInsightPanels)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as InsightPanelConfig[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPanels(parsed.map((panel) => ({ ...panel, id: panel.id || generatePanelId() })))
        }
      }
    } catch (error) {
      console.warn("Failed to load clinical insights panels from storage", error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels))
    } catch (error) {
      console.warn("Failed to persist clinical insights panels", error)
    }
  }, [panels])

  const addPanel = () => {
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      const suffix = prev.length + 1
      return [
        ...prev,
        {
          id: generatePanelId(),
          title: `Custom Panel ${suffix}`,
          subtitle: "Summarize clinically relevant information for this focus area.",
          prompt: "Describe the key clinical insights for this focus area using the provided context.",
        },
      ]
    })
  }

  const updatePanel = (id: string, patch: Partial<InsightPanelConfig>) => {
    setPanels((prev) => prev.map((panel) => (panel.id === id ? { ...panel, ...patch, id: panel.id } : panel)))
  }

  const removePanel = (id: string) => {
    setPanels((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((panel) => panel.id !== id)
    })
  }

  const resetPanels = () => {
    setPanels(getDefaultClinicalInsightPanels())
  }

  const reorderPanels = useCallback((orderedIds: string[]) => {
    setPanels((prev) => {
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) return prev
      const idSet = new Set(orderedIds)
      const ordered = orderedIds
        .map((id) => prev.find((panel) => panel.id === id))
        .filter((panel): panel is InsightPanelConfig => Boolean(panel))
      const remaining = prev.filter((panel) => !idSet.has(panel.id))
      return [...ordered, ...remaining]
    })
  }, [])

  const value = useMemo(
    () => ({ panels, addPanel, updatePanel, removePanel, resetPanels, reorderPanels, maxPanels: MAX_PANELS }),
    [panels, reorderPanels],
  )

  return <ClinicalInsightsConfigContext.Provider value={value}>{children}</ClinicalInsightsConfigContext.Provider>
}

export function useClinicalInsightsConfig() {
  const context = useContext(ClinicalInsightsConfigContext)
  if (!context) {
    throw new Error("useClinicalInsightsConfig must be used within ClinicalInsightsConfigProvider")
  }
  return context
}
