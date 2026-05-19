"use client"

import { createContext, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAudience, type Audience } from "./audience.provider"
import { useAuth } from "./auth.provider"
import {
  saveChatTemplate,
  deleteChatTemplate,
  subscribeToChatTemplates,
  batchSaveChatTemplates,
  replaceAllChatTemplates,
} from "@/src/infrastructure/firebase/template-sync"

type ChatTemplate = {
  id: string
  label: string
  content: string
  order: number
  audience: Audience
}

type ChatTemplatesContextValue = {
  templates: ChatTemplate[]
  addTemplate: () => string | null
  updateTemplate: (id: string, patch: Partial<Omit<ChatTemplate, "id" | "audience">>) => void
  removeTemplate: (id: string) => void
  moveTemplate: (fromIndex: number, toIndex: number) => void
  resetTemplates: () => void
  saveTemplates: () => Promise<void>
  maxTemplates: number
  isSaving: boolean
  isLoading: boolean
}

const DEFAULT_TEMPLATES_EN_MEDICAL: Omit<ChatTemplate, "audience">[] = [
  {
    id: "summary",
    label: "Summarize Medical Information",
    content:
      "Provide a structured summary of the patient's current presentation, key diagnoses, treatments, and pending follow-ups. Highlight urgent issues and recommended next steps.",
    order: 0,
  },
  {
    id: "plan",
    label: "Care Plan Recommendations",
    content:
      "Review the patient's data and propose a prioritized plan of care, including medications, monitoring recommendations, patient counseling, and follow-up scheduling.",
    order: 1,
  },
  {
    id: "handoff",
    label: "Shift Handoff Note",
    content:
      "Draft a handoff note covering patient status, recent changes, active issues, anticipated problems, and action items for the next clinician.",
    order: 2,
  },
]

const DEFAULT_TEMPLATES_EN_PATIENT: Omit<ChatTemplate, "audience">[] = [
  {
    id: "my-summary",
    label: "Explain my health record",
    content:
      "Using the imported records, write a plain-language summary of my recent health status, ongoing conditions, current medications, and any lab values that are out of normal range. Explain medical terms briefly in parentheses. End with an encouragement to discuss anything unclear with my doctor.",
    order: 0,
  },
  {
    id: "lab-explain",
    label: "What does this lab report mean?",
    content:
      "Pick the most recent lab report from my records. For each test, explain in everyday language what the value measures, whether mine is in the normal range, and what high/low values could indicate. Do not diagnose — recommend I confirm with my doctor.",
    order: 1,
  },
  {
    id: "questions-for-doctor",
    label: "Questions to ask at my next visit",
    content:
      "Based on my recent records, suggest a short list of questions I should ask my doctor at the next visit. Cover medications I'm taking, symptoms I might have mentioned, abnormal lab values, and any preventive care that seems overdue.",
    order: 2,
  },
]

const DEFAULT_TEMPLATES_ZH_MEDICAL: Omit<ChatTemplate, "audience">[] = [
  {
    id: "summary",
    label: "醫療資訊摘要",
    content:
      "提供病人目前狀況、主要診斷、治療和待追蹤事項的結構化摘要。突顯緊急問題和建議的下一步行動。",
    order: 0,
  },
  {
    id: "plan",
    label: "照護計畫建議",
    content:
      "檢視病人資料並提出優先順序的照護計畫，包括藥物、監測建議、病人衛教和後續追蹤安排。",
    order: 1,
  },
  {
    id: "handoff",
    label: "交班紀錄",
    content:
      "起草交班紀錄，涵蓋病人狀態、近期變化、活動中的問題、預期問題和下一位臨床人員的行動項目。",
    order: 2,
  },
]

const DEFAULT_TEMPLATES_ZH_PATIENT: Omit<ChatTemplate, "audience">[] = [
  {
    id: "my-summary",
    label: "我的健康摘要",
    content:
      "請用我匯入的健康資料，幫我整理一份白話版的健康摘要：最近的身體狀況、慢性疾病、目前用藥，以及檢驗數值是否有超出正常範圍的項目。醫療術語請在括號中補充說明。最後提醒我若有疑慮應與醫師討論。",
    order: 0,
  },
  {
    id: "lab-explain",
    label: "這張化驗單在告訴我什麼？",
    content:
      "請挑選我最近的一份檢驗報告，逐項用日常用語說明：這項檢查是在量什麼？我的數值是否在正常範圍？偏高或偏低可能代表什麼？請不要直接做診斷，提醒我向醫師確認。",
    order: 1,
  },
  {
    id: "questions-for-doctor",
    label: "我下次回診要問什麼",
    content:
      "根據我的健康資料，幫我整理一份下次回診可以問醫師的問題清單，涵蓋目前用藥、可能提到的症狀、異常檢驗值，以及任何看起來該補做的預防性檢查或疫苗。",
    order: 2,
  },
]

const STORAGE_KEY = "medical-chat-templates"
const MAX_TEMPLATES = 999

function generateTemplateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `template_${Math.random().toString(36).slice(2, 10)}`
}

const ChatTemplatesContext = createContext<ChatTemplatesContextValue | null>(null)

function getDefaultsFor(language: 'en' | 'zh-TW', audience: Audience): ChatTemplate[] {
  let base: Omit<ChatTemplate, "audience">[]
  if (language === 'zh-TW') {
    base = audience === 'medical' ? DEFAULT_TEMPLATES_ZH_MEDICAL : DEFAULT_TEMPLATES_ZH_PATIENT
  } else {
    base = audience === 'medical' ? DEFAULT_TEMPLATES_EN_MEDICAL : DEFAULT_TEMPLATES_EN_PATIENT
  }
  return base.map((t) => ({ ...t, audience }))
}

function getAllDefaults(language: 'en' | 'zh-TW'): ChatTemplate[] {
  return [
    ...getDefaultsFor(language, 'medical'),
    ...getDefaultsFor(language, 'patient'),
  ]
}

function templatesEqualDefaults(templates: ChatTemplate[], language: 'en' | 'zh-TW', audience: Audience): boolean {
  const defaults = getDefaultsFor(language, audience)
  const current = templates.filter((t) => t.audience === audience).sort((a, b) => a.order - b.order)
  if (current.length !== defaults.length) return false
  return current.every((t, i) => {
    const d = defaults[i]
    return d && t.id === d.id && t.label === d.label && t.content === d.content
  })
}

export function ChatTemplatesProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()
  const currentLang: 'en' | 'zh-TW' = locale === 'zh-TW' ? 'zh-TW' : 'en'

  const [allTemplates, setAllTemplates] = useState<ChatTemplate[]>(() => getAllDefaults('en'))
  const allTemplatesRef = useRef<ChatTemplate[]>(allTemplates)
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [customByAudience, setCustomByAudience] = useState<Record<Audience, boolean>>({ medical: false, patient: false })
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    allTemplatesRef.current = allTemplates
  }, [allTemplates])

  // Sanitize a raw template-like object into a ChatTemplate. Falls back missing audience to 'medical'.
  const sanitizeTemplate = (entry: unknown, fallbackOrder: number): ChatTemplate | null => {
    if (!entry || typeof entry !== "object") return null
    const c = entry as Record<string, unknown>
    const audienceValue: Audience = c.audience === 'patient' ? 'patient' : 'medical'
    return {
      id: typeof c.id === "string" ? c.id : generateTemplateId(),
      label: typeof c.label === "string" ? c.label : "Untitled Template",
      content: typeof c.content === "string" ? c.content : "",
      order: typeof c.order === "number" ? c.order : fallbackOrder,
      audience: audienceValue,
    }
  }

  // Initial load (Firestore subscription or localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return

    const loadFromLocalStorage = () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (!stored) {
          setAllTemplates(getAllDefaults(currentLang))
          setCustomByAudience({ medical: false, patient: false })
          return
        }
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          setAllTemplates(getAllDefaults(currentLang))
          setCustomByAudience({ medical: false, patient: false })
          return
        }
        const sanitized = parsed
          .map((e, i) => sanitizeTemplate(e, i))
          .filter((t): t is ChatTemplate => t !== null)
          .slice(0, MAX_TEMPLATES)

        // If sanitized covers only one audience, seed defaults for the other audience so the user
        // still sees something when they switch.
        const seen = new Set(sanitized.map((t) => t.audience))
        const merged = [...sanitized]
        const customMap: Record<Audience, boolean> = { medical: false, patient: false }
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (seen.has(aud)) {
            customMap[aud] = !templatesEqualDefaults(sanitized, currentLang, aud)
          } else {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        setAllTemplates(merged)
        setCustomByAudience(customMap)
      } catch (error) {
        console.warn("Failed to load prompt templates from storage", error)
        setAllTemplates(getAllDefaults(currentLang))
      }
    }

    if (user?.uid) {
      // Logged in: subscription will populate; mark migration path
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sanitized = parsed
              .map((e, i) => sanitizeTemplate(e, i))
              .filter((t): t is ChatTemplate => t !== null)
              .slice(0, MAX_TEMPLATES)
            if (sanitized.length > 0) {
              batchSaveChatTemplates(user.uid, sanitized).catch((err) => {
                console.warn('[Chat Templates] Migration to Firestore failed', err)
              })
              window.localStorage.removeItem(STORAGE_KEY)
            }
          }
        } catch (err) {
          console.warn('[Chat Templates] Failed to parse localStorage for migration', err)
        }
      }
    } else {
      loadFromLocalStorage()
    }

    setHasLoadedFromStorage(true)
  }, [hasLoadedFromStorage, user?.uid, currentLang])

  // Firestore subscription for logged-in users
  useEffect(() => {
    if (!user?.uid || !hasLoadedFromStorage) return

    const unsubscribe = subscribeToChatTemplates(user.uid, (updated: ChatTemplate[]) => {
      if (isSyncing) return
      if (updated.length === 0) {
        setAllTemplates(getAllDefaults(currentLang))
        setCustomByAudience({ medical: false, patient: false })
      } else {
        const seen = new Set(updated.map((t) => t.audience))
        const merged: ChatTemplate[] = [...updated.slice(0, MAX_TEMPLATES)]
        const customMap: Record<Audience, boolean> = { medical: false, patient: false }
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (seen.has(aud)) {
            customMap[aud] = !templatesEqualDefaults(updated, currentLang, aud)
          } else {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        setAllTemplates(merged)
        setCustomByAudience(customMap)
      }
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [user?.uid, hasLoadedFromStorage, isSyncing, currentLang])

  // For non-logged-in users, the localStorage load above finishes loading immediately
  useEffect(() => {
    if (!hasLoadedFromStorage) return
    if (user?.uid) return
    setIsLoading(false)
  }, [hasLoadedFromStorage, user?.uid])

  // When language changes, swap defaults for any audience that's not customized
  useEffect(() => {
    if (!hasLoadedFromStorage) return
    setAllTemplates((prev) => {
      const next = prev.filter((t) => customByAudience[t.audience])
      ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
        if (!customByAudience[aud]) {
          next.push(...getDefaultsFor(currentLang, aud))
        }
      })
      return next
    })
  }, [currentLang, hasLoadedFromStorage]) // intentionally omit customByAudience to avoid loops

  // Persist to localStorage for non-logged-in users
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedFromStorage) return
    if (user?.uid) return

    try {
      const allDefault = (['medical', 'patient'] as Audience[]).every(
        (aud) => !customByAudience[aud] || templatesEqualDefaults(allTemplates, currentLang, aud),
      )
      if (allDefault) {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allTemplates))
      }
    } catch (error) {
      console.warn("Failed to persist prompt templates", error)
    }
  }, [allTemplates, customByAudience, hasLoadedFromStorage, currentLang, user?.uid])

  const templates = useMemo(
    () => allTemplates.filter((t) => t.audience === audience).sort((a, b) => a.order - b.order),
    [allTemplates, audience],
  )

  const addTemplate = () => {
    const audienceCount = allTemplates.filter((t) => t.audience === audience).length
    if (audienceCount >= MAX_TEMPLATES) return null
    const nextOrder = audienceCount
    const newTemplate: ChatTemplate = {
      id: generateTemplateId(),
      label: "New Prompt Template",
      content: "",
      order: nextOrder,
      audience,
    }
    setAllTemplates((prev) => [...prev, newTemplate])
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
    return newTemplate.id
  }

  const updateTemplate = (id: string, patch: Partial<Omit<ChatTemplate, "id" | "audience">>) => {
    setAllTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, id, audience: t.audience } : t)))
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const removeTemplate = (id: string) => {
    setAllTemplates((prev) => {
      const targetAudience = prev.find((t) => t.id === id)?.audience
      if (!targetAudience) return prev
      const audienceCount = prev.filter((t) => t.audience === targetAudience).length
      if (audienceCount <= 1) return prev // Keep at least one per audience
      return prev.filter((t) => t.id !== id)
    })
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const moveTemplate = (fromIndex: number, toIndex: number) => {
    setAllTemplates((prev) => {
      const filtered = prev.filter((t) => t.audience === audience).sort((a, b) => a.order - b.order)
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= filtered.length || toIndex >= filtered.length) return prev
      const reordered = [...filtered]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      const orderById = new Map(reordered.map((t, i) => [t.id, i]))
      return prev.map((t) =>
        t.audience === audience ? { ...t, order: orderById.get(t.id) ?? t.order } : t,
      )
    })
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const resetTemplates = async () => {
    const defaults = getDefaultsFor(currentLang, audience)
    setAllTemplates((prev) => [...prev.filter((t) => t.audience !== audience), ...defaults])
    setCustomByAudience((prev) => ({ ...prev, [audience]: false }))

    if (user?.uid) {
      setIsSyncing(true)
      try {
        // Replace only the current audience's templates in Firestore
        // We need to: delete current-audience docs, save new defaults, leave the other audience alone.
        const other = allTemplatesRef.current.filter((t) => t.audience !== audience)
        await replaceAllChatTemplates(user.uid, [...other, ...defaults])
      } catch (error) {
        console.error('[Chat Templates] Reset failed:', error)
      } finally {
        setIsSyncing(false)
      }
    }
  }

  const saveTemplates = async () => {
    if (!user?.uid) return
    setIsSaving(true)
    setIsSyncing(true)
    try {
      const current = allTemplatesRef.current
      // Renumber order within each audience to keep it tight
      const byAudience = new Map<Audience, ChatTemplate[]>()
      current.forEach((t) => {
        if (!byAudience.has(t.audience)) byAudience.set(t.audience, [])
        byAudience.get(t.audience)!.push(t)
      })
      const renumbered: ChatTemplate[] = []
      byAudience.forEach((arr) => {
        arr.sort((a, b) => a.order - b.order).forEach((t, i) => renumbered.push({ ...t, order: i }))
      })
      await replaceAllChatTemplates(user.uid, renumbered)
    } catch (error) {
      console.error('[Chat Templates] Save failed:', error)
    } finally {
      setIsSaving(false)
      setIsSyncing(false)
    }
  }

  const value = useMemo(
    () => ({
      templates,
      addTemplate,
      updateTemplate,
      removeTemplate,
      moveTemplate,
      resetTemplates,
      saveTemplates,
      maxTemplates: MAX_TEMPLATES,
      isSaving,
      isLoading,
    }),
    [templates, isSaving, isLoading],
  )

  return <ChatTemplatesContext.Provider value={value}>{children}</ChatTemplatesContext.Provider>
}

export function useChatTemplates() {
  const context = useContext(ChatTemplatesContext)
  if (!context) {
    throw new Error("useChatTemplates must be used within ChatTemplatesProvider")
  }
  return context
}

export type { ChatTemplate }
