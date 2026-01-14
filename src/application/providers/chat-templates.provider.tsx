"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAuth } from "./auth.provider"
import { 
  getUserChatTemplates, 
  saveChatTemplate, 
  deleteChatTemplate, 
  subscribeToChatTemplates,
  batchSaveChatTemplates,
  replaceAllChatTemplates,
  type ChatTemplate as FirestoreChatTemplate
} from "@/src/infrastructure/firebase/template-sync"

type ChatTemplate = {
  id: string
  label: string
  content: string
}

type ChatTemplatesContextValue = {
  templates: ChatTemplate[]
  addTemplate: () => void
  updateTemplate: (id: string, patch: Partial<Omit<ChatTemplate, "id">>) => void
  removeTemplate: (id: string) => void
  resetTemplates: () => void
  saveTemplates: () => Promise<void>
  maxTemplates: number
  isSaving: boolean
}

const DEFAULT_TEMPLATES_EN: ChatTemplate[] = [
  {
    id: "summary",
    label: "Summarize Medical Information",
    content:
      "Provide a structured summary of the patient's current presentation, key diagnoses, treatments, and pending follow-ups. Highlight urgent issues and recommended next steps.",
  },
  {
    id: "plan",
    label: "Care Plan Recommendations",
    content:
      "Review the patient's data and propose a prioritized plan of care, including medications, monitoring recommendations, patient counseling, and follow-up scheduling.",
  },
  {
    id: "handoff",
    label: "Shift Handoff Note",
    content:
      "Draft a handoff note covering patient status, recent changes, active issues, anticipated problems, and action items for the next clinician.",
  },
]

const DEFAULT_TEMPLATES_ZH: ChatTemplate[] = [
  {
    id: "summary",
    label: "醫療資訊摘要",
    content:
      "提供病人目前狀況、主要診斷、治療和待追蹤事項的結構化摘要。突顯緊急問題和建議的下一步行動。",
  },
  {
    id: "plan",
    label: "照護計畫建議",
    content:
      "檢視病人資料並提出優先順序的照護計畫，包括藥物、監測建議、病人衛教和後續追蹤安排。",
  },
  {
    id: "handoff",
    label: "交班紀錄",
    content:
      "起草交班紀錄，涵蓋病人狀態、近期變化、活動中的問題、預期問題和下一位臨床人員的行動項目。",
  },
]

const STORAGE_KEY = "medical-chat-templates"
const MAX_TEMPLATES = 6

function generateTemplateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `template_${Math.random().toString(36).slice(2, 10)}`
}

const ChatTemplatesContext = createContext<ChatTemplatesContextValue | null>(null)

function getDefaultTemplates(language: 'en' | 'zh-TW' = 'en'): ChatTemplate[] {
  const templates = language === 'zh-TW' ? DEFAULT_TEMPLATES_ZH : DEFAULT_TEMPLATES_EN
  return templates.map((template) => ({ ...template }))
}

export function ChatTemplatesProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const { user } = useAuth()
  const [templates, setTemplates] = useState<ChatTemplate[]>(() => getDefaultTemplates())
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [isCustomTemplates, setIsCustomTemplates] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load templates from Firestore (for logged-in users) or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasLoadedFromStorage) return
    
    const loadTemplates = async () => {
      // If user is logged in, load from Firestore
      if (user?.uid) {
        try {
          const firestoreTemplates = await getUserChatTemplates(user.uid)
          
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
              const sanitized = parsed.reduce<ChatTemplate[]>((acc, entry) => {
                if (!entry || typeof entry !== "object") return acc
                const candidate = entry as Record<string, unknown>
                const template: ChatTemplate = {
                  id: typeof candidate.id === "string" ? candidate.id : generateTemplateId(),
                  label: typeof candidate.label === "string" ? candidate.label : "Untitled Template",
                  content: typeof candidate.content === "string" ? candidate.content : "",
                }
                acc.push(template)
                return acc
              }, [])
              
              // Migrate to Firestore
              if (sanitized.length > 0) {
                await batchSaveChatTemplates(user.uid, sanitized.slice(0, MAX_TEMPLATES))
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
          const sanitized = parsed.reduce<ChatTemplate[]>((acc, entry) => {
            if (!entry || typeof entry !== "object") return acc
            const candidate = entry as Record<string, unknown>
            const template: ChatTemplate = {
              id: typeof candidate.id === "string" ? candidate.id : generateTemplateId(),
              label: typeof candidate.label === "string" ? candidate.label : "Untitled Template",
              content: typeof candidate.content === "string" ? candidate.content : "",
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
    
    const unsubscribe = subscribeToChatTemplates(user.uid, (updatedTemplates: ChatTemplate[]) => {
      if (!isSyncing) {
        if (updatedTemplates.length > 0) {
          setTemplates(updatedTemplates.slice(0, MAX_TEMPLATES))
          setIsCustomTemplates(true)
        } else {
          // If Firestore is empty, use default templates
          const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
          setTemplates(getDefaultTemplates(currentLang))
          setIsCustomTemplates(false)
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

  const addTemplate = () => {
    const newTemplate: ChatTemplate = {
      id: generateTemplateId(),
      label: "New Prompt Template",
      content: "",
    }
    
    setTemplates((prev) => {
      if (prev.length >= MAX_TEMPLATES) return prev
      return [...prev, newTemplate]
    })
    setIsCustomTemplates(true)
  }

  const updateTemplate = (id: string, patch: Partial<Omit<ChatTemplate, "id">>) => {
    setTemplates((prev) => prev.map((template) => 
      template.id === id ? { ...template, ...patch, id } : template
    ))
    setIsCustomTemplates(true)
  }

  const removeTemplate = (id: string) => {
    setTemplates((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((template) => template.id !== id)
    })
    setIsCustomTemplates(true)
  }

  const resetTemplates = async () => {
    const currentLang = locale === 'zh-TW' ? 'zh-TW' : 'en'
    const defaultTemplates = getDefaultTemplates(currentLang)
    
    // Update local state immediately
    setTemplates(defaultTemplates)
    setIsCustomTemplates(false)
    
    // If logged in, save default templates to Firestore
    if (user?.uid) {
      setIsSyncing(true)
      try {
        await batchSaveChatTemplates(user.uid, defaultTemplates)
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
      await replaceAllChatTemplates(user.uid, templates)
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
      resetTemplates, 
      saveTemplates,
      maxTemplates: MAX_TEMPLATES,
      isSaving
    }),
    [templates, isSaving],
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
