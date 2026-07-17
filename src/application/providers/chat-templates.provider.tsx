"use client"

import { createContext, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from "react"
import { useLanguage } from "./language.provider"
import { useAudience, type Audience } from "./audience.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import {
  subscribeToChatTemplates,
  batchSaveChatTemplates,
  replaceAllChatTemplates,
} from "@/src/infrastructure/firebase/template-sync"

type ChatTemplate = {
  id: string
  label: string
  content: string
  /** Optional "/shortcut" trigger keyword for the slash-template menu. */
  shortcut?: string
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

// Default chat templates. Each carries a "/shortcut" for the slash menu.
// Drafted with the quality principles popular clinical prompt libraries
// converge on (problem-based, concise, flag-missing-don't-invent, and
// patient-facing notes always include warning signs / when to seek care).
const DEFAULT_TEMPLATES_EN_MEDICAL: Omit<ChatTemplate, "audience">[] = [
  {
    id: "summary",
    label: "Clinical summary",
    shortcut: "summary",
    content:
      "Provide a concise, high-yield summary from the patient's data: current status, key diagnoses and problem list, ongoing treatments, and pending follow-ups. Clearly flag urgent issues needing immediate action and the recommended next steps. Mark any missing data as [to confirm]; do not invent.",
    order: 0,
  },
  {
    id: "soap",
    label: "SOAP note",
    shortcut: "soap",
    content:
      "Produce a problem-based SOAP note from the patient's data. S: chief complaint, HPI, relevant history. O: vitals, exam, key labs and imaging. A: per-problem assessment and differential with brief clinical reasoning. P: per-problem workup, medications, monitoring, education, and follow-up. Keep it concise; mark missing inputs as [to confirm] and do not invent data.",
    order: 1,
  },
  {
    id: "admission",
    label: "Admission note (H&P)",
    shortcut: "admission",
    content:
      "Produce an admission H&P from the patient's data: chief complaint, HPI, past medical/surgical history, medications and allergies, family/social history, review of systems, physical exam, admitting diagnoses with a problem list, and an initial management plan. Mark missing items as [to confirm]; do not assume.",
    order: 2,
  },
  {
    id: "progress",
    label: "Progress note",
    shortcut: "progress",
    content:
      "Produce today's inpatient progress note: changes over the past 24 hours, current vitals and key lab trends, and an updated problem-based assessment and plan (with monitoring and anticipated discharge criteria). Use only the provided data; mark gaps as [to confirm].",
    order: 3,
  },
  {
    id: "discharge",
    label: "Discharge summary",
    shortcut: "discharge",
    content:
      "Produce a structured discharge summary from the patient's data: hospital course, discharge diagnoses, key test and procedure results, discharge medications (marking new / changed / stopped), follow-up arrangements, and return precautions (when to seek care immediately). Mark gaps as [to confirm].",
    order: 4,
  },
  {
    id: "consult",
    label: "Consult reply",
    shortcut: "consult",
    content:
      "As the consulting clinician, produce a consult note from the patient's data: reason for consult, pertinent history and findings, assessment, and specific recommendations (diagnosis, further workup, management, medications), with follow-up suggestions where appropriate.",
    order: 5,
  },
  {
    id: "ddx",
    label: "Differential diagnosis",
    shortcut: "ddx",
    content:
      "From the patient's current symptoms and findings, produce a likelihood-ordered differential diagnosis. Flag the \"do-not-miss\" dangerous diagnoses, and give one or two sentences per item on how to rule it in or out.",
    order: 6,
  },
  {
    id: "safety",
    label: "Safety check",
    shortcut: "safety",
    content:
      "Run a safety check over the patient's data and surface potential clinical safety issues: drug–drug interactions, drug–allergy conflicts, contraindications, duplicate therapy, critical lab values, doses needing renal/hepatic adjustment, high-risk medication monitoring (e.g. anticoagulants), and important follow-ups that appear missing or overdue. Order by severity with a brief recommendation each. Use only the provided data and state uncertainty explicitly.",
    order: 7,
  },
  {
    id: "edu",
    label: "Patient education handout",
    shortcut: "edu",
    content:
      "Produce a patient-facing education handout for this patient in plain, encouraging language: for their main diagnoses and medications, cover key points about the condition, medication precautions, lifestyle and diet advice, warning signs and when to seek care immediately, and follow-up reminders. Briefly explain medical terms in parentheses.",
    order: 8,
  },
]

const DEFAULT_TEMPLATES_EN_PATIENT: Omit<ChatTemplate, "audience">[] = [
  {
    id: "my-summary",
    label: "My health summary",
    shortcut: "summary",
    content:
      "Using my imported records, write a concise, plain-language summary of my recent health status, ongoing conditions, current medications, and any lab values out of normal range. Briefly explain medical terms in parentheses. End by encouraging me to discuss anything unclear with my doctor.",
    order: 0,
  },
  {
    id: "lab-explain",
    label: "What does my lab report mean?",
    shortcut: "lab",
    content:
      "Pick my most recent lab report. For each test, explain in everyday language what it measures, whether mine is in the normal range, and what a high or low value could indicate. Do not diagnose; recommend I confirm with my doctor.",
    order: 1,
  },
  {
    id: "meds",
    label: "Explain my medications",
    shortcut: "meds",
    content:
      "Using my medication list, explain each medicine in plain language: what it's for, how to take it, and common precautions and side effects. Remind me not to stop any medication on my own and to ask my doctor or pharmacist if unsure.",
    order: 2,
  },
  {
    id: "safety",
    label: "Warning signs & when to seek care",
    shortcut: "safety",
    content:
      "Based on my conditions and medications, tell me the warning signs I should watch for and the situations in which I should seek care or go to the emergency room immediately. Use plain, bulleted language, and remind me this is not a diagnosis — see a doctor if concerned.",
    order: 3,
  },
  {
    id: "questions-for-doctor",
    label: "Questions to ask at my next visit",
    shortcut: "questions",
    content:
      "Based on my records, suggest a short list of questions to ask my doctor at the next visit, covering my medications, symptoms I may have mentioned, abnormal lab values, and any preventive care that seems overdue.",
    order: 4,
  },
  {
    id: "edu",
    label: "My self-care advice",
    shortcut: "edu",
    content:
      "Based on my records, give me personalized self-care advice for my chronic conditions and abnormal results, covering lifestyle, diet, exercise, and medication adherence, plus warning signs to watch for. Remind me that important decisions should still be discussed with my doctor.",
    order: 5,
  },
]

const DEFAULT_TEMPLATES_ZH_MEDICAL: Omit<ChatTemplate, "audience">[] = [
  {
    id: "summary",
    label: "病情摘要",
    shortcut: "summary",
    content:
      "依病人資料提供精簡、高效的病情摘要：目前狀況、主要診斷與問題清單、進行中的治療、待追蹤事項；明確標出需要立即處理的緊急問題與建議的下一步。資料不足處以〔待補〕標註，勿臆測。",
    order: 0,
  },
  {
    id: "soap",
    label: "SOAP 病歷",
    shortcut: "soap",
    content:
      "依病人資料產生 problem-based SOAP 病歷。S：主訴、現病史、相關病史；O：生命徵象、理學檢查、重要檢驗與影像結果；A：依各問題列出評估與鑑別診斷及簡要臨床推理；P：每個問題的檢查、用藥、監測、衛教與追蹤。精簡不灌水，缺項以〔待補〕標註，不要捏造未提供的資訊。",
    order: 1,
  },
  {
    id: "admission",
    label: "入院病摘（H&P）",
    shortcut: "admission",
    content:
      "依病人資料產生入院病摘（H&P）：主訴、現病史、過去病史與手術史、用藥與過敏、家族與社會史、系統回顧、理學檢查、入院診斷與問題清單，以及初步處置計畫。缺項以〔待補〕標註，勿臆測。",
    order: 2,
  },
  {
    id: "progress",
    label: "病程紀錄",
    shortcut: "progress",
    content:
      "產生今日住院病程紀錄：過去 24 小時的病情變化、目前生命徵象與重要檢驗趨勢，接續並更新 problem-based 評估與計畫（含監測與預期出院條件）。僅依提供的資料，缺項以〔待補〕標註。",
    order: 3,
  },
  {
    id: "discharge",
    label: "出院病摘",
    shortcut: "discharge",
    content:
      "依病人資料產生結構化出院病摘：住院經過摘要、出院診斷、重要檢查與處置結果、出院用藥（標明新增／變更／停用）、追蹤安排，以及返診與警訊（何時應立即就醫）衛教。缺項以〔待補〕標註。",
    order: 4,
  },
  {
    id: "consult",
    label: "會診回覆",
    shortcut: "consult",
    content:
      "以會診醫師角度，依病人資料產生會診回覆：會診目的、相關病史與檢查重點、評估，以及具體建議（診斷、進一步檢查、處置與用藥），必要時提出追蹤建議。",
    order: 5,
  },
  {
    id: "ddx",
    label: "鑑別診斷",
    shortcut: "ddx",
    content:
      "依病人目前的症狀與檢查結果，產生依可能性排序的鑑別診斷清單；標出「不可漏掉（do-not-miss）」的危急診斷；每項以一兩句說明如何進一步 rule in／rule out。",
    order: 6,
  },
  {
    id: "safety",
    label: "安全檢查",
    shortcut: "safety",
    content:
      "對病人資料做一次安全檢查，突顯潛在的臨床安全問題：藥物交互作用、藥物與過敏衝突、禁忌症、重複治療、危急檢驗值、需依腎／肝功能調整的劑量、高風險藥物（如抗凝劑）監測，以及看似遺漏或逾期的重要追蹤。依嚴重度排序，並對每項給簡要建議。僅依提供的資料，不確定處明確指出。",
    order: 7,
  },
  {
    id: "edu",
    label: "病人衛教單張",
    shortcut: "edu",
    content:
      "為這位病人產生一份可直接交給病人的衛教單張，使用白話、鼓勵的語氣：針對其主要診斷與用藥，說明疾病重點、用藥注意事項、生活與飲食建議、警訊與何時應立即就醫，以及回診提醒。醫療術語以括號簡短說明。",
    order: 8,
  },
]

const DEFAULT_TEMPLATES_ZH_PATIENT: Omit<ChatTemplate, "audience">[] = [
  {
    id: "my-summary",
    label: "我的健康摘要",
    shortcut: "summary",
    content:
      "請用我匯入的健康資料，幫我整理一份白話、精簡的健康摘要：最近的身體狀況、慢性疾病、目前用藥，以及檢驗數值是否有超出正常範圍的項目。醫療術語請在括號中補充說明。最後提醒我若有疑慮應與醫師討論。",
    order: 0,
  },
  {
    id: "lab-explain",
    label: "這張化驗單在告訴我什麼？",
    shortcut: "lab",
    content:
      "請挑選我最近的一份檢驗報告，逐項用日常用語說明：這項檢查是在量什麼？我的數值是否在正常範圍？偏高或偏低可能代表什麼？請不要直接做診斷，提醒我向醫師確認。",
    order: 1,
  },
  {
    id: "meds",
    label: "我的用藥說明",
    shortcut: "meds",
    content:
      "請用我的用藥資料，逐項用白話說明：每個藥是做什麼用的、應該怎麼吃、常見的注意事項與可能的副作用。提醒我不要自行停藥，有疑問先問醫師或藥師。",
    order: 2,
  },
  {
    id: "safety",
    label: "警訊與何時就醫",
    shortcut: "safety",
    content:
      "根據我的疾病與用藥，告訴我有哪些「警訊」要特別注意，以及出現哪些情況時應該立即就醫或掛急診。請用白話、條列方式，並提醒我這不是診斷，有疑慮要找醫師。",
    order: 3,
  },
  {
    id: "questions-for-doctor",
    label: "我下次回診要問什麼",
    shortcut: "questions",
    content:
      "根據我的健康資料，幫我整理一份下次回診可以問醫師的問題清單，涵蓋目前用藥、可能提到的症狀、異常檢驗值，以及任何看起來該補做的預防性檢查或疫苗。",
    order: 4,
  },
  {
    id: "edu",
    label: "我的衛教建議",
    shortcut: "edu",
    content:
      "根據我的健康資料，給我個人化的自我照護建議：針對我的慢性病與異常檢驗，提供生活、飲食、運動與用藥順從性方面可行的建議，以及需要注意的警訊。提醒我重大決定仍須與醫師討論。",
    order: 5,
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
