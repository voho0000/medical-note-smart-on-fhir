"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAuth } from "./auth.provider"
import {
  getUserClinicalInsightPanels,
  subscribeToClinicalInsightPanels,
  batchSaveClinicalInsightPanels,
  replaceAllClinicalInsightPanels,
  type ClinicalInsightPanel as FirestoreClinicalInsightPanel
} from "@/src/infrastructure/firebase/clinical-insights-sync"

export type InsightPanelConfig = {
  id: string
  title: string
  prompt: string
  autoGenerate: boolean
  order: number
}

const DEFAULT_PANELS_EN: InsightPanelConfig[] = [
  {
    id: "safety",
    title: "Safety Flag",
    prompt:
      "Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.",
    autoGenerate: false,
    order: 0,
  },
  {
    id: "changes",
    title: "What's Changed",
    prompt:
      "Compare the patient's recent clinical data to prior information and list the most important changes in status, therapy, or results. Emphasize deltas that require attention.",
    autoGenerate: false,
    order: 1,
  },
  {
    id: "snapshot",
    title: "Clinical Snapshot",
    prompt:
      "Create a succinct clinical snapshot covering active problems, current therapies, recent results, and outstanding tasks. Keep it brief and actionable.",
    autoGenerate: false,
    order: 2,
  },
]

const DEFAULT_PANELS_ZH: InsightPanelConfig[] = [
  {
    id: "safety",
    title: "安全警示",
    prompt:
      "檢視臨床資料並標記任何立即的病人安全風險，包括藥物交互作用、異常結果或緊急追蹤需求。以簡潔的條列式回應，依嚴重程度排序。",
    autoGenerate: false,
    order: 0,
  },
  {
    id: "changes",
    title: "變化摘要",
    prompt:
      "比較病人最近的臨床資料與先前資訊，列出狀態、治療或結果中最重要的變化。強調需要注意的差異。",
    autoGenerate: false,
    order: 1,
  },
  {
    id: "snapshot",
    title: "臨床快照",
    prompt:
      "建立簡潔的臨床快照，涵蓋活動中的問題、目前治療、近期結果和待辦事項。保持簡短且可執行。",
    autoGenerate: false,
    order: 2,
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

export function getDefaultClinicalInsightPanels(language: 'en' | 'zh-TW' = 'en'): InsightPanelConfig[] {
  const panels = language === 'zh-TW' ? DEFAULT_PANELS_ZH : DEFAULT_PANELS_EN
  return panels.map((panel) => ({ ...panel }))
}

type ClinicalInsightsConfigContextValue = {
  panels: InsightPanelConfig[]
  addPanel: () => void
  updatePanel: (id: string, patch: Partial<InsightPanelConfig>) => void
  removePanel: (id: string) => void
  resetPanels: () => Promise<void>
  savePanels: () => Promise<void>
  maxPanels: number
  reorderPanels: (orderedIds: string[]) => void
  isSaving: boolean
}

const ClinicalInsightsConfigContext = createContext<ClinicalInsightsConfigContextValue | null>(null)

export function ClinicalInsightsConfigProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const { user } = useAuth()
  const [panels, setPanels] = useState<InsightPanelConfig[]>(() => getDefaultClinicalInsightPanels())
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [isCustomPanels, setIsCustomPanels] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load panels from Firestore (for logged-in users) or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return
    
    const loadPanels = async () => {
      // If user is logged in, load from Firestore
      if (user?.uid) {
        try {
          const firestorePanels = await getUserClinicalInsightPanels(user.uid)
          
          if (firestorePanels.length > 0) {
            setPanels(firestorePanels.slice(0, MAX_PANELS))
            setIsCustomPanels(true)
            setHasLoadedFromStorage(true)
            return
          }
          
          // No Firestore panels, check if we should migrate from localStorage
          const stored = window.localStorage.getItem(STORAGE_KEY)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed) && parsed.length > 0) {
              const sanitized = parsed.map((panel, index) => ({
                ...panel,
                id: panel.id || generatePanelId(),
                autoGenerate: panel.autoGenerate ?? false,
                order: panel.order ?? index
              }))
              
              // Migrate to Firestore
              if (sanitized.length > 0) {
                await batchSaveClinicalInsightPanels(user.uid, sanitized.slice(0, MAX_PANELS))
                setPanels(sanitized.slice(0, MAX_PANELS))
                setIsCustomPanels(true)
                // Clear localStorage after migration
                window.localStorage.removeItem(STORAGE_KEY)
                setHasLoadedFromStorage(true)
                return
              }
            }
          }
          
          // No panels found, use defaults
          const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
          setPanels(getDefaultClinicalInsightPanels(currentLang))
          setIsCustomPanels(false)
        } catch (error) {
          console.warn("Failed to load panels from Firestore", error)
        }
      } else {
        // Not logged in, use localStorage
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY)
          if (!stored) {
            const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
            setPanels(getDefaultClinicalInsightPanels(currentLang))
            setIsCustomPanels(false)
            setHasLoadedFromStorage(true)
            return
          }
          const parsed = JSON.parse(stored)
          if (!Array.isArray(parsed)) return
          const sanitized = parsed.map((panel, index) => ({
            ...panel,
            id: panel.id || generatePanelId(),
            autoGenerate: panel.autoGenerate ?? false,
            order: panel.order ?? index
          }))

          if (sanitized.length > 0) {
            setPanels(sanitized.slice(0, MAX_PANELS))
            setIsCustomPanels(true)
          }
        } catch (error) {
          console.warn("Failed to load panels from storage", error)
        }
      }
      
      setHasLoadedFromStorage(true)
    }
    
    loadPanels()
  }, [hasLoadedFromStorage, user?.uid, locale])

  useEffect(() => {
    if (!hasLoadedFromStorage) return
    if (isCustomPanels) return

    const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
    const defaults = getDefaultClinicalInsightPanels(currentLang)
    setPanels(defaults)
  }, [isCustomPanels, locale, hasLoadedFromStorage])


  // Subscribe to real-time updates for logged-in users
  useEffect(() => {
    if (!user?.uid || !hasLoadedFromStorage) return
    
    const unsubscribe = subscribeToClinicalInsightPanels(user.uid, (updatedPanels: InsightPanelConfig[]) => {
      if (!isSyncing) {
        if (updatedPanels.length > 0) {
          setPanels(updatedPanels.slice(0, MAX_PANELS))
          setIsCustomPanels(true)
        } else {
          // If Firestore is empty, use default panels
          const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
          setPanels(getDefaultClinicalInsightPanels(currentLang))
          setIsCustomPanels(false)
        }
      }
    })
    
    return () => unsubscribe()
  }, [user?.uid, hasLoadedFromStorage, isSyncing, locale])
  
  // Persist to localStorage for non-logged-in users
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedFromStorage) return
    if (user?.uid) return // Don't use localStorage if logged in
    
    try {
      const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
      const defaultPanels = getDefaultClinicalInsightPanels(currentLang)
      const defaultIds = new Set(defaultPanels.map(p => p.id))
      
      const allAreDefault = panels.every(p => defaultIds.has(p.id))
      const allMatchDefault = allAreDefault && panels.length === defaultPanels.length &&
        panels.every(panel => {
          const defaultPanel = defaultPanels.find(p => p.id === panel.id)
          return defaultPanel && 
                 panel.title === defaultPanel.title &&
                 panel.prompt === defaultPanel.prompt
        })
      
      if (allMatchDefault) {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels))
      }
    } catch (error) {
      console.warn("Failed to persist panels", error)
    }
  }, [panels, hasLoadedFromStorage, locale, user?.uid])


  const addPanel = () => {
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      const suffix = prev.length + 1
      return [
        ...prev,
        {
          id: generatePanelId(),
          title: `Custom Panel ${suffix}`,
          prompt: "Describe the key clinical insights for this focus area using the provided context.",
          autoGenerate: false,
          order: prev.length,
        },
      ]
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
      return prev.filter((panel) => panel.id !== id)
    })
    setIsCustomPanels(true)
  }

  const resetPanels = async () => {
    const currentLang = locale === "zh-TW" ? "zh-TW" : "en"
    const defaultPanels = getDefaultClinicalInsightPanels(currentLang)
    
    // Update local state immediately
    setPanels(defaultPanels)
    setIsCustomPanels(false)
    
    // If logged in, save default panels to Firestore
    if (user?.uid) {
      setIsSyncing(true)
      try {
        await batchSaveClinicalInsightPanels(user.uid, defaultPanels)
      } catch (error) {
        console.error('[Clinical Insights] Reset failed:', error)
      } finally {
        setIsSyncing(false)
      }
    }
  }

  const savePanels = async () => {
    if (!user?.uid) return
    
    setIsSaving(true)
    setIsSyncing(true)
    try {
      // Update order before saving
      const panelsWithOrder = panels.map((panel, index) => ({
        ...panel,
        order: index
      }))
      await replaceAllClinicalInsightPanels(user.uid, panelsWithOrder)
    } catch (error) {
      console.error('[Clinical Insights] Save failed:', error)
    } finally {
      setIsSaving(false)
      setIsSyncing(false)
    }
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
    setIsCustomPanels(true)
  }, [])

  const value = useMemo(
    () => ({ 
      panels, 
      addPanel, 
      updatePanel, 
      removePanel, 
      resetPanels, 
      savePanels,
      reorderPanels, 
      maxPanels: MAX_PANELS,
      isSaving
    }),
    [panels, reorderPanels, isSaving],
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
