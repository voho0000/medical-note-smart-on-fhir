"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAuth } from "./auth.provider"
import { 
  getUserTemplates, 
  saveTemplate, 
  deleteTemplate, 
  subscribeToTemplates,
  batchSaveTemplates,
  type PromptTemplate as FirestoreTemplate
} from "@/src/infrastructure/firebase/template-sync"

type PromptTemplate = {
  id: string
  label: string
  description?: string
  content: string
}

type PromptTemplatesContextValue = {
  templates: PromptTemplate[]
  addTemplate: () => void
  updateTemplate: (id: string, patch: Partial<Omit<PromptTemplate, "id">>) => void
  removeTemplate: (id: string) => void
  resetTemplates: () => void
  maxTemplates: number
}

const DEFAULT_TEMPLATES_EN: PromptTemplate[] = [
  {
    id: "summary",
    label: "Summarize Medical Information",
    description: "Concise, problem-oriented patient summary.",
    content:
      "Provide a structured summary of the patient's current presentation, key diagnoses, treatments, and pending follow-ups. Highlight urgent issues and recommended next steps.",
  },
  {
    id: "plan",
    label: "Care Plan Recommendations",
    description: "Outline plan of care and monitoring items.",
    content:
      "Review the patient's data and propose a prioritized plan of care, including medications, monitoring recommendations, patient counseling, and follow-up scheduling.",
  },
  {
    id: "handoff",
    label: "Shift Handoff Note",
    description: "Key updates for handoff communication.",
    content:
      "Draft a handoff note covering patient status, recent changes, active issues, anticipated problems, and action items for the next clinician.",
  },
]

const DEFAULT_TEMPLATES_ZH: PromptTemplate[] = [
  {
    id: "summary",
    label: "醫療資訊摘要",
    description: "簡明、以問題為導向的病人摘要。",
    content:
      "提供病人目前狀況、主要診斷、治療和待追蹤事項的結構化摘要。突顯緊急問題和建議的下一步行動。",
  },
  {
    id: "plan",
    label: "照護計畫建議",
    description: "概述照護計畫和監測項目。",
    content:
      "檢視病人資料並提出優先順序的照護計畫，包括藥物、監測建議、病人衛教和後續追蹤安排。",
  },
  {
    id: "handoff",
    label: "交班紀錄",
    description: "交班溝通的關鍵更新。",
    content:
      "起草交班紀錄，涵蓋病人狀態、近期變化、活動中的問題、預期問題和下一位臨床人員的行動項目。",
  },
]

const STORAGE_KEY = "medical-chat-prompt-templates"
const MAX_TEMPLATES = 6

function generateTemplateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `template_${Math.random().toString(36).slice(2, 10)}`
}

const PromptTemplatesContext = createContext<PromptTemplatesContextValue | null>(null)

function getDefaultTemplates(language: 'en' | 'zh-TW' = 'en'): PromptTemplate[] {
  const templates = language === 'zh-TW' ? DEFAULT_TEMPLATES_ZH : DEFAULT_TEMPLATES_EN
  return templates.map((template) => ({ ...template }))
}

export function PromptTemplatesProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const { user } = useAuth()
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => getDefaultTemplates())
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [isCustomTemplates, setIsCustomTemplates] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Load templates from Firestore (for logged-in users) or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return
    
    const loadTemplates = async () => {
      // If user is logged in, load from Firestore
      if (user?.uid) {
        try {
          const firestoreTemplates = await getUserTemplates(user.uid)
          
          if (firestoreTemplates.length > 0) {
            setTemplates(firestoreTemplates.slice(0, MAX_TEMPLATES))
            setIsCustomTemplates(true)
            setHasLoadedFromStorage(true)
            return
          }
          
          // No Firestore templates, check if we should migrate from localStorage
          const stored = window.localStorage.getItem(STORAGE_KEY)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed) && parsed.length > 0) {
              const sanitized = parsed.reduce<PromptTemplate[]>((acc, entry) => {
                if (!entry || typeof entry !== "object") return acc
                const candidate = entry as Record<string, unknown>
                const template: PromptTemplate = {
                  id: typeof candidate.id === "string" ? candidate.id : generateTemplateId(),
                  label: typeof candidate.label === "string" ? candidate.label : "Untitled Template",
                  content: typeof candidate.content === "string" ? candidate.content : "",
                }
                if (typeof candidate.description === "string" && candidate.description.trim()) {
                  template.description = candidate.description.trim()
                }
                acc.push(template)
                return acc
              }, [])
              
              // Migrate to Firestore
              if (sanitized.length > 0) {
                await batchSaveTemplates(user.uid, sanitized.slice(0, MAX_TEMPLATES))
                setTemplates(sanitized.slice(0, MAX_TEMPLATES))
                setIsCustomTemplates(true)
                // Clear localStorage after migration
                window.localStorage.removeItem(STORAGE_KEY)
                setHasLoadedFromStorage(true)
                return
              }
            }
          }
          
          // No templates found, use defaults
          const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
          setTemplates(getDefaultTemplates(currentLang))
          setIsCustomTemplates(false)
        } catch (error) {
          console.warn("Failed to load templates from Firestore", error)
        }
      } else {
        // Not logged in, use localStorage
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY)
          if (!stored) {
            const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
            setTemplates(getDefaultTemplates(currentLang))
            setIsCustomTemplates(false)
            setHasLoadedFromStorage(true)
            return
          }
          const parsed = JSON.parse(stored)
          if (!Array.isArray(parsed)) return
          const sanitized = parsed.reduce<PromptTemplate[]>((acc, entry) => {
            if (!entry || typeof entry !== "object") return acc
            const candidate = entry as Record<string, unknown>
            const template: PromptTemplate = {
              id: typeof candidate.id === "string" ? candidate.id : generateTemplateId(),
              label: typeof candidate.label === "string" ? candidate.label : "Untitled Template",
              content: typeof candidate.content === "string" ? candidate.content : "",
            }
            if (typeof candidate.description === "string" && candidate.description.trim()) {
              template.description = candidate.description.trim()
            }
            acc.push(template)
            return acc
          }, [])

          if (sanitized.length > 0) {
            setTemplates(sanitized.slice(0, MAX_TEMPLATES))
            setIsCustomTemplates(true)
          }
        } catch (error) {
          console.warn("Failed to load prompt templates from storage", error)
        }
      }
      
      setHasLoadedFromStorage(true)
    }
    
    loadTemplates()
  }, [hasLoadedFromStorage, user?.uid, locale])
  
  // Update templates when language changes (only if using default templates)
  useEffect(() => {
    if (!hasLoadedFromStorage) return
    if (isCustomTemplates) return
    
    const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
    const defaults = getDefaultTemplates(currentLang)
    setTemplates(defaults)
  }, [isCustomTemplates, locale, hasLoadedFromStorage])

  // Subscribe to real-time updates for logged-in users
  useEffect(() => {
    if (!user?.uid || !hasLoadedFromStorage) return
    
    const unsubscribe = subscribeToTemplates(user.uid, (updatedTemplates) => {
      if (!isSyncing) {
        setTemplates(updatedTemplates.slice(0, MAX_TEMPLATES))
        setIsCustomTemplates(updatedTemplates.length > 0)
      }
    })
    
    return () => unsubscribe()
  }, [user?.uid, hasLoadedFromStorage, isSyncing])
  
  // Persist to localStorage for non-logged-in users
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasLoadedFromStorage) return
    if (user?.uid) return // Don't use localStorage if logged in
    
    try {
      const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
      const defaultTemplates = getDefaultTemplates(currentLang)
      const defaultIds = new Set(defaultTemplates.map(t => t.id))
      
      const allAreDefault = templates.every(t => defaultIds.has(t.id))
      const allMatchDefault = allAreDefault && templates.length === defaultTemplates.length &&
        templates.every(template => {
          const defaultTemplate = defaultTemplates.find(t => t.id === template.id)
          return defaultTemplate && 
                 template.label === defaultTemplate.label &&
                 template.content === defaultTemplate.content
        })
      
      if (allMatchDefault) {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
      }
    } catch (error) {
      console.warn("Failed to persist prompt templates", error)
    }
  }, [templates, hasLoadedFromStorage, locale, user?.uid])

  const addTemplate = async () => {
    const newTemplate: PromptTemplate = {
      id: generateTemplateId(),
      label: "New Prompt Template",
      description: "",
      content: "",
    }
    
    setTemplates((prev) => {
      if (prev.length >= MAX_TEMPLATES) return prev
      return [...prev, newTemplate]
    })
    setIsCustomTemplates(true)
    
    // Save to Firestore if logged in
    if (user?.uid) {
      setIsSyncing(true)
      await saveTemplate(user.uid, newTemplate)
      setIsSyncing(false)
    }
  }

  const updateTemplate = async (id: string, patch: Partial<Omit<PromptTemplate, "id">>) => {
    let updatedTemplate: PromptTemplate | undefined
    
    setTemplates((prev) => prev.map((template) => {
      if (template.id === id) {
        updatedTemplate = { ...template, ...patch, id }
        return updatedTemplate
      }
      return template
    }))
    setIsCustomTemplates(true)
    
    // Save to Firestore if logged in
    if (user?.uid && updatedTemplate) {
      setIsSyncing(true)
      await saveTemplate(user.uid, updatedTemplate)
      setIsSyncing(false)
    }
  }

  const removeTemplate = async (id: string) => {
    setTemplates((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((template) => template.id !== id)
    })
    setIsCustomTemplates(true)
    
    // Delete from Firestore if logged in
    if (user?.uid) {
      setIsSyncing(true)
      await deleteTemplate(user.uid, id)
      setIsSyncing(false)
    }
  }

  const resetTemplates = async () => {
    const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
    const defaultTemplates = getDefaultTemplates(currentLang)
    setTemplates(defaultTemplates)
    setIsCustomTemplates(false)
    
    // If logged in, delete all custom templates from Firestore
    if (user?.uid) {
      setIsSyncing(true)
      const currentTemplates = templates
      for (const template of currentTemplates) {
        await deleteTemplate(user.uid, template.id)
      }
      setIsSyncing(false)
    }
  }

  const value = useMemo(
    () => ({ templates, addTemplate, updateTemplate, removeTemplate, resetTemplates, maxTemplates: MAX_TEMPLATES }),
    [templates],
  )

  return <PromptTemplatesContext.Provider value={value}>{children}</PromptTemplatesContext.Provider>
}

export function usePromptTemplates() {
  const context = useContext(PromptTemplatesContext)
  if (!context) {
    throw new Error("usePromptTemplates must be used within PromptTemplatesProvider")
  }
  return context
}

export type { PromptTemplate }
