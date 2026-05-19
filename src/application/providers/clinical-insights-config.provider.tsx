"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAudience, type Audience } from "./audience.provider"
import { useAuth } from "./auth.provider"
import {
  subscribeToClinicalInsightPanels,
  batchSaveClinicalInsightPanels,
  replaceAllClinicalInsightPanels,
} from "@/src/infrastructure/firebase/clinical-insights-sync"

export type InsightPanelConfig = {
  id: string
  title: string
  prompt: string
  autoGenerate: boolean
  order: number
  audience: Audience
}

const DEFAULT_PANELS_EN_MEDICAL: Omit<InsightPanelConfig, "audience">[] = [
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

const DEFAULT_PANELS_EN_PATIENT: Omit<InsightPanelConfig, "audience">[] = [
  {
    id: "health-overview",
    title: "My Health Overview",
    prompt:
      "Using the imported personal health records, write a friendly plain-language overview of my current health: ongoing conditions, current medications, and any recent results that stand out. Define medical terms briefly when needed. End with a reminder that I should discuss specifics with my doctor.",
    autoGenerate: false,
    order: 0,
  },
  {
    id: "watch-out",
    title: "Things to Watch Out For",
    prompt:
      "Based on my health records, point out items that might deserve attention at my next medical visit — for example, abnormal lab values, medications that interact, vaccinations or screenings that look overdue. Do NOT diagnose; explain why each item matters in plain language and suggest I confirm with my doctor.",
    autoGenerate: false,
    order: 1,
  },
  {
    id: "questions-doctor",
    title: "Questions for My Doctor",
    prompt:
      "Based on my recent records, draft a concise list of questions I should ask at my next appointment. Cover medications, symptoms, abnormal results, and preventive care. Phrase the questions the way a patient would naturally ask them.",
    autoGenerate: false,
    order: 2,
  },
]

const DEFAULT_PANELS_ZH_MEDICAL: Omit<InsightPanelConfig, "audience">[] = [
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

const DEFAULT_PANELS_ZH_PATIENT: Omit<InsightPanelConfig, "audience">[] = [
  {
    id: "health-overview",
    title: "我的健康總覽",
    prompt:
      "請用我匯入的個人健康資料，幫我整理一份白話版的健康總覽：目前的慢性病、正在使用的藥物，以及近期較需要關注的檢驗結果。專有名詞請在括號中簡單說明。最後提醒我若有疑慮應與醫師討論。",
    autoGenerate: false,
    order: 0,
  },
  {
    id: "watch-out",
    title: "需要留意的事項",
    prompt:
      "根據我的健康資料，列出下次回診時可能值得留意的項目，例如：異常的檢驗值、可能交互作用的藥物、看起來逾期未做的疫苗或健檢。請不要做診斷，僅用白話文說明為什麼這些項目重要，並提醒我向醫師確認。",
    autoGenerate: false,
    order: 1,
  },
  {
    id: "questions-doctor",
    title: "可以問醫師的問題",
    prompt:
      "根據我的近期健康資料，幫我整理一份下次回診可以詢問醫師的問題清單，涵蓋用藥、症狀、異常檢驗值與預防性檢查。請用病人會自然問出口的口吻。",
    autoGenerate: false,
    order: 2,
  },
]

const STORAGE_KEY = "clinical-insights-panels"
const MAX_PANELS = 999

function generatePanelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `panel_${Math.random().toString(36).slice(2, 10)}`
}

function getDefaultsFor(language: 'en' | 'zh-TW', audience: Audience): InsightPanelConfig[] {
  let base: Omit<InsightPanelConfig, "audience">[]
  if (language === 'zh-TW') {
    base = audience === 'medical' ? DEFAULT_PANELS_ZH_MEDICAL : DEFAULT_PANELS_ZH_PATIENT
  } else {
    base = audience === 'medical' ? DEFAULT_PANELS_EN_MEDICAL : DEFAULT_PANELS_EN_PATIENT
  }
  return base.map((panel) => ({ ...panel, audience }))
}

function getAllDefaults(language: 'en' | 'zh-TW'): InsightPanelConfig[] {
  return [
    ...getDefaultsFor(language, 'medical'),
    ...getDefaultsFor(language, 'patient'),
  ]
}

function panelsEqualDefaults(panels: InsightPanelConfig[], language: 'en' | 'zh-TW', audience: Audience): boolean {
  const defaults = getDefaultsFor(language, audience)
  const current = panels.filter((p) => p.audience === audience).sort((a, b) => a.order - b.order)
  if (current.length !== defaults.length) return false
  return current.every((p, i) => {
    const d = defaults[i]
    return d && p.id === d.id && p.title === d.title && p.prompt === d.prompt
  })
}

export function getDefaultClinicalInsightPanels(language: 'en' | 'zh-TW' = 'en', audience: Audience = 'medical'): InsightPanelConfig[] {
  return getDefaultsFor(language, audience)
}

type ClinicalInsightsConfigContextValue = {
  panels: InsightPanelConfig[]
  addPanel: () => string | null
  updatePanel: (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => void
  updatePanelAndSave: (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => Promise<void>
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
  const { audience } = useAudience()
  const { user } = useAuth()
  const currentLang: 'en' | 'zh-TW' = locale === "zh-TW" ? "zh-TW" : "en"

  const [allPanels, setAllPanels] = useState<InsightPanelConfig[]>(() => getAllDefaults('en'))
  const allPanelsRef = useRef<InsightPanelConfig[]>(allPanels)
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [customByAudience, setCustomByAudience] = useState<Record<Audience, boolean>>({ medical: false, patient: false })
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    allPanelsRef.current = allPanels
  }, [allPanels])

  const sanitizePanel = (entry: unknown, fallbackOrder: number): InsightPanelConfig | null => {
    if (!entry || typeof entry !== "object") return null
    const c = entry as Record<string, unknown>
    const audienceValue: Audience = c.audience === 'patient' ? 'patient' : 'medical'
    return {
      id: typeof c.id === "string" ? c.id : generatePanelId(),
      title: typeof c.title === "string" ? c.title : "Untitled Panel",
      prompt: typeof c.prompt === "string" ? c.prompt : "",
      autoGenerate: c.autoGenerate === true,
      order: typeof c.order === "number" ? c.order : fallbackOrder,
      audience: audienceValue,
    }
  }

  // Initial load
  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return

    const loadFromLocalStorage = () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (!stored) {
          setAllPanels(getAllDefaults(currentLang))
          setCustomByAudience({ medical: false, patient: false })
          return
        }
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          setAllPanels(getAllDefaults(currentLang))
          setCustomByAudience({ medical: false, patient: false })
          return
        }
        const sanitized = parsed
          .map((e, i) => sanitizePanel(e, i))
          .filter((p): p is InsightPanelConfig => p !== null)
          .slice(0, MAX_PANELS)

        const seen = new Set(sanitized.map((p) => p.audience))
        const merged = [...sanitized]
        const customMap: Record<Audience, boolean> = { medical: false, patient: false }
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (seen.has(aud)) {
            customMap[aud] = !panelsEqualDefaults(sanitized, currentLang, aud)
          } else {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        setAllPanels(merged)
        setCustomByAudience(customMap)
      } catch (error) {
        console.warn("Failed to load panels from storage", error)
        setAllPanels(getAllDefaults(currentLang))
      }
    }

    if (user?.uid) {
      // Migration: if localStorage has data, push to Firestore once
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sanitized = parsed
              .map((e, i) => sanitizePanel(e, i))
              .filter((p): p is InsightPanelConfig => p !== null)
              .slice(0, MAX_PANELS)
            if (sanitized.length > 0) {
              batchSaveClinicalInsightPanels(user.uid, sanitized).catch((err) => {
                console.warn('[Clinical Insights] Migration failed', err)
              })
              window.localStorage.removeItem(STORAGE_KEY)
            }
          }
        } catch (err) {
          console.warn('[Clinical Insights] Failed to parse localStorage for migration', err)
        }
      }
    } else {
      loadFromLocalStorage()
    }

    setHasLoadedFromStorage(true)
  }, [hasLoadedFromStorage, user?.uid, currentLang])

  // Firestore subscription
  useEffect(() => {
    if (!user?.uid || !hasLoadedFromStorage) return

    const unsubscribe = subscribeToClinicalInsightPanels(user.uid, (updated: InsightPanelConfig[]) => {
      if (isSyncing) return
      if (updated.length === 0) {
        setAllPanels(getAllDefaults(currentLang))
        setCustomByAudience({ medical: false, patient: false })
      } else {
        const seen = new Set(updated.map((p) => p.audience))
        const merged: InsightPanelConfig[] = [...updated.slice(0, MAX_PANELS)]
        const customMap: Record<Audience, boolean> = { medical: false, patient: false }
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (seen.has(aud)) {
            customMap[aud] = !panelsEqualDefaults(updated, currentLang, aud)
          } else {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        setAllPanels(merged)
        setCustomByAudience(customMap)
      }
    })

    return () => unsubscribe()
  }, [user?.uid, hasLoadedFromStorage, isSyncing, currentLang])

  // On language change: swap defaults for any audience that isn't customized
  useEffect(() => {
    if (!hasLoadedFromStorage) return
    setAllPanels((prev) => {
      const next = prev.filter((p) => customByAudience[p.audience])
      ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
        if (!customByAudience[aud]) {
          next.push(...getDefaultsFor(currentLang, aud))
        }
      })
      return next
    })
  }, [currentLang, hasLoadedFromStorage]) // omit customByAudience to avoid loops

  // Persist to localStorage for non-logged-in users
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedFromStorage) return
    if (user?.uid) return

    try {
      const allDefault = (['medical', 'patient'] as Audience[]).every(
        (aud) => !customByAudience[aud] || panelsEqualDefaults(allPanels, currentLang, aud),
      )
      if (allDefault) {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allPanels))
      }
    } catch (error) {
      console.warn("Failed to persist panels", error)
    }
  }, [allPanels, customByAudience, hasLoadedFromStorage, currentLang, user?.uid])

  const panels = useMemo(
    () => allPanels.filter((p) => p.audience === audience).sort((a, b) => a.order - b.order),
    [allPanels, audience],
  )

  const addPanel = () => {
    const audienceCount = allPanels.filter((p) => p.audience === audience).length
    if (audienceCount >= MAX_PANELS) return null
    const suffix = audienceCount + 1
    const newPanel: InsightPanelConfig = {
      id: generatePanelId(),
      title: `Custom Panel ${suffix}`,
      prompt: "Describe the key clinical insights for this focus area using the provided context.",
      autoGenerate: false,
      order: audienceCount,
      audience,
    }
    setAllPanels((prev) => [...prev, newPanel])
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
    return newPanel.id
  }

  const updatePanel = (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => {
    setAllPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, audience: p.audience } : p)))
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const updatePanelAndSave = async (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => {
    return new Promise<void>((resolve, reject) => {
      setAllPanels((prev) => {
        const updated = prev.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, audience: p.audience } : p))

        if (user?.uid) {
          setIsSaving(true)
          // Renumber order within each audience to keep tight, then save the full set
          const byAudience = new Map<Audience, InsightPanelConfig[]>()
          updated.forEach((p) => {
            if (!byAudience.has(p.audience)) byAudience.set(p.audience, [])
            byAudience.get(p.audience)!.push(p)
          })
          const renumbered: InsightPanelConfig[] = []
          byAudience.forEach((arr) => {
            arr.sort((a, b) => a.order - b.order).forEach((p, i) => renumbered.push({ ...p, order: i }))
          })

          replaceAllClinicalInsightPanels(user.uid, renumbered)
            .then(() => resolve())
            .catch((error) => {
              console.error('[Clinical Insights] Save failed:', error)
              reject(error)
            })
            .finally(() => setIsSaving(false))
        } else {
          resolve()
        }

        return updated
      })
      setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
    })
  }

  const removePanel = (id: string) => {
    setAllPanels((prev) => {
      const target = prev.find((p) => p.id === id)
      if (!target) return prev
      const audienceCount = prev.filter((p) => p.audience === target.audience).length
      if (audienceCount <= 1) return prev // keep at least one per audience
      return prev.filter((p) => p.id !== id)
    })
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const resetPanels = async () => {
    const defaults = getDefaultsFor(currentLang, audience)
    setAllPanels((prev) => [...prev.filter((p) => p.audience !== audience), ...defaults])
    setCustomByAudience((prev) => ({ ...prev, [audience]: false }))

    if (user?.uid) {
      setIsSyncing(true)
      try {
        const other = allPanelsRef.current.filter((p) => p.audience !== audience)
        await replaceAllClinicalInsightPanels(user.uid, [...other, ...defaults])
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
      const current = allPanelsRef.current
      const byAudience = new Map<Audience, InsightPanelConfig[]>()
      current.forEach((p) => {
        if (!byAudience.has(p.audience)) byAudience.set(p.audience, [])
        byAudience.get(p.audience)!.push(p)
      })
      const renumbered: InsightPanelConfig[] = []
      byAudience.forEach((arr) => {
        arr.sort((a, b) => a.order - b.order).forEach((p, i) => renumbered.push({ ...p, order: i }))
      })
      await replaceAllClinicalInsightPanels(user.uid, renumbered)
    } catch (error) {
      console.error('[Clinical Insights] Save failed:', error)
    } finally {
      setIsSaving(false)
      setIsSyncing(false)
    }
  }

  const reorderPanels = useCallback((orderedIds: string[]) => {
    setAllPanels((prev) => {
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) return prev
      const idSet = new Set(orderedIds)
      const filtered = prev.filter((p) => p.audience === audience)
      const ordered = orderedIds
        .map((id) => filtered.find((p) => p.id === id))
        .filter((p): p is InsightPanelConfig => Boolean(p))
      const orderById = new Map(ordered.map((p, i) => [p.id, i]))
      // Reassign order within current audience; preserve other audience untouched.
      return prev.map((p) => {
        if (p.audience !== audience) return p
        if (!idSet.has(p.id)) return p
        return { ...p, order: orderById.get(p.id) ?? p.order }
      })
    })
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }, [audience])

  const value = useMemo(
    () => ({
      panels,
      addPanel,
      updatePanel,
      updatePanelAndSave,
      removePanel,
      resetPanels,
      savePanels,
      reorderPanels,
      maxPanels: MAX_PANELS,
      isSaving,
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
