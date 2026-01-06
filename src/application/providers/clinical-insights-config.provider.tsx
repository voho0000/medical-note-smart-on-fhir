"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLanguage } from "./language.provider"

export type InsightPanelConfig = {
  id: string
  title: string
  subtitle?: string
  prompt: string
  autoGenerate?: boolean
}

const DEFAULT_PANELS_EN: InsightPanelConfig[] = [
  {
    id: "safety",
    title: "Safety Flag",
    prompt:
      "Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.",
    autoGenerate: false,
  },
  {
    id: "changes",
    title: "What's Changed",
    prompt:
      "Compare the patient's recent clinical data to prior information and list the most important changes in status, therapy, or results. Emphasize deltas that require attention.",
    autoGenerate: false,
  },
  {
    id: "snapshot",
    title: "Clinical Snapshot",
    prompt:
      "Create a succinct clinical snapshot covering active problems, current therapies, recent results, and outstanding tasks. Keep it brief and actionable.",
    autoGenerate: false,
  },
]

const DEFAULT_PANELS_ZH: InsightPanelConfig[] = [
  {
    id: "safety",
    title: "安全警示",
    prompt:
      "檢視臨床資料並標記任何立即的病人安全風險，包括藥物交互作用、異常結果或緊急追蹤需求。以簡潔的條列式回應，依嚴重程度排序。",
    autoGenerate: false,
  },
  {
    id: "changes",
    title: "變化摘要",
    prompt:
      "比較病人最近的臨床資料與先前資訊，列出狀態、治療或結果中最重要的變化。強調需要注意的差異。",
    autoGenerate: false,
  },
  {
    id: "snapshot",
    title: "臨床快照",
    prompt:
      "建立簡潔的臨床快照，涵蓋活動中的問題、目前治療、近期結果和待辦事項。保持簡短且可執行。",
    autoGenerate: false,
  },
]

const STORAGE_KEY = "clinical-insights-panels"
const AUTO_GENERATE_STORAGE_KEY = "clinical-insights-auto-generate"
const MAX_PANELS = 6

function generatePanelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `panel_${Math.random().toString(36).slice(2, 10)}`
}

export function getDefaultClinicalInsightPanels(language: 'en' | 'zh-TW' = 'en'): InsightPanelConfig[] {
  const panels = language === 'zh-TW' ? DEFAULT_PANELS_ZH : DEFAULT_PANELS_EN
  return panels.map((panel) => ({ ...panel }))
}

type ClinicalInsightsConfigContextValue = {
  panels: InsightPanelConfig[]
  addPanel: () => void
  updatePanel: (id: string, patch: Partial<InsightPanelConfig>) => void
  removePanel: (id: string) => void
  resetPanels: () => void
  maxPanels: number
  reorderPanels: (orderedIds: string[]) => void
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
}

const ClinicalInsightsConfigContext = createContext<ClinicalInsightsConfigContextValue | null>(null)

export function ClinicalInsightsConfigProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const [panels, setPanels] = useState<InsightPanelConfig[]>(() => getDefaultClinicalInsightPanels())
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [isCustomPanels, setIsCustomPanels] = useState(false)
  const [autoGenerate, setAutoGenerateState] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return
    
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as InsightPanelConfig[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPanels(parsed.map((panel) => ({ 
            ...panel, 
            id: panel.id || generatePanelId(),
            autoGenerate: panel.autoGenerate ?? false 
          })))
          setIsCustomPanels(true)
        }
      } else {
        const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
        setPanels(getDefaultClinicalInsightPanels(currentLang))
        setIsCustomPanels(false)
      }
      
      const storedAutoGenerate = window.localStorage.getItem(AUTO_GENERATE_STORAGE_KEY)
      if (storedAutoGenerate !== null) {
        setAutoGenerateState(storedAutoGenerate === "true")
      }
    } catch (error) {
      console.warn("Failed to load clinical insights panels from storage", error)
    }

    setHasLoadedFromStorage(true)
  }, [hasLoadedFromStorage, locale])

  useEffect(() => {
    if (!hasLoadedFromStorage) return
    if (isCustomPanels) return

    const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
    const defaults = getDefaultClinicalInsightPanels(currentLang)
    setPanels(defaults)
  }, [isCustomPanels, locale, hasLoadedFromStorage])


  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedFromStorage) return // Don't save until we've loaded
    
    // Debounce to allow language change effect to complete first
    const timeoutId = setTimeout(() => {
      try {
        // Check if current panels are default panels
        const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
        const defaultPanels = getDefaultClinicalInsightPanels(currentLang)
        const defaultIds = new Set(defaultPanels.map(p => p.id))

        const allAreDefault = panels.every(p => defaultIds.has(p.id))
        const allMatchDefault = allAreDefault && panels.length === defaultPanels.length &&
          panels.every(panel => {
            const defaultPanel = defaultPanels.find(p => p.id === panel.id)
            return defaultPanel && 
                   panel.title === defaultPanel.title &&
                   panel.subtitle === defaultPanel.subtitle &&
                   panel.prompt === defaultPanel.prompt
          })
        
        if (allMatchDefault) {
          window.localStorage.removeItem(STORAGE_KEY)
        } else {
          // Save custom panels
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels))
        }
      } catch (error) {
        console.warn("Failed to persist clinical insights panels", error)
      }
    }, 100) // 100ms delay to let language change complete
    
    return () => clearTimeout(timeoutId)
  }, [panels, hasLoadedFromStorage, locale])


  const addPanel = () => {
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      const suffix = prev.length + 1
      const updated = [
        ...prev,
        {
          id: generatePanelId(),
          title: `Custom Panel ${suffix}`,
          prompt: "Describe the key clinical insights for this focus area using the provided context.",
          autoGenerate: false,
        },
      ]
      return updated
    })
    setIsCustomPanels(true)
  }

  const updatePanel = (id: string, patch: Partial<InsightPanelConfig>) => {
    setPanels((prev) => prev.map((panel) => (panel.id === id ? { ...panel, ...patch, id: panel.id } : panel)))
    setIsCustomPanels(true)
  }

  const removePanel = (id: string) => {
    setPanels((prev) => {
      if (prev.length <= 1) return prev
      const updated = prev.filter((panel) => panel.id !== id)
      return updated
    })
    setIsCustomPanels(true)
  }

  const resetPanels = () => {
    const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
    setPanels(getDefaultClinicalInsightPanels(currentLang))
    setIsCustomPanels(false)
  }

  const reorderPanels = useCallback((orderedIds: string[]) => {
    setPanels((prev) => {
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) return prev
      const idSet = new Set(orderedIds)
      const ordered = orderedIds
        .map((id) => prev.find((panel) => panel.id === id))
        .filter((panel): panel is InsightPanelConfig => Boolean(panel))
      const remaining = prev.filter((panel) => !idSet.has(panel.id))
      const updated = [...ordered, ...remaining]
      return updated
    })
    setIsCustomPanels(true)
  }, [])

  const setAutoGenerate = useCallback((value: boolean) => {
    setAutoGenerateState(value)
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(AUTO_GENERATE_STORAGE_KEY, String(value))
      } catch (error) {
        console.warn("Failed to persist auto-generate setting", error)
      }
    }
  }, [])

  const value = useMemo(
    () => ({ panels, addPanel, updatePanel, removePanel, resetPanels, reorderPanels, maxPanels: MAX_PANELS, autoGenerate, setAutoGenerate }),
    [panels, reorderPanels, autoGenerate, setAutoGenerate],
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
