"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

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
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => {
    if (typeof window === "undefined") return getDefaultTemplates()
    
    const browserLang = window.navigator.language
    const language = browserLang.startsWith('zh') ? 'zh-TW' : 'en'
    return getDefaultTemplates(language)
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.reduce<PromptTemplate[]>((acc, entry) => {
        if (!entry || typeof entry !== "object") return acc
        const candidate = entry as Record<string, unknown>
        const label = typeof candidate.label === "string" ? candidate.label : ""
        const content = typeof candidate.content === "string" ? candidate.content : ""
        if (!content.trim()) return acc

        const template: PromptTemplate = {
          id: typeof candidate.id === "string" ? candidate.id : generateTemplateId(),
          label: label || "Untitled Template",
          content,
        }

        if (typeof candidate.description === "string" && candidate.description.trim()) {
          template.description = candidate.description.trim()
        }

        acc.push(template)
        return acc
      }, [])

      if (sanitized.length > 0) {
        setTemplates(sanitized.slice(0, MAX_TEMPLATES))
      }
    } catch (error) {
      console.warn("Failed to load prompt templates from storage", error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    } catch (error) {
      console.warn("Failed to persist prompt templates", error)
    }
  }, [templates])

  const addTemplate = () => {
    setTemplates((prev) => {
      if (prev.length >= MAX_TEMPLATES) return prev
      return [
        ...prev,
        {
          id: generateTemplateId(),
          label: "New Prompt Template",
          description: "",
          content: "",
        },
      ]
    })
  }

  const updateTemplate = (id: string, patch: Partial<Omit<PromptTemplate, "id">>) => {
    setTemplates((prev) => prev.map((template) => (template.id === id ? { ...template, ...patch, id } : template)))
  }

  const removeTemplate = (id: string) => {
    setTemplates((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((template) => template.id !== id)
    })
  }

  const resetTemplates = () => {
    if (typeof window === "undefined") {
      setTemplates(getDefaultTemplates())
      return
    }
    
    const browserLang = window.navigator.language
    const language = browserLang.startsWith('zh') ? 'zh-TW' : 'en'
    setTemplates(getDefaultTemplates(language))
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
