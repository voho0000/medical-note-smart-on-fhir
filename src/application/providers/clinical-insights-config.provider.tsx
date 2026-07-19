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
import { stripLegacySafetyPanels } from "./clinical-insights-legacy"
import {
  MAX_AUTO_INSIGHT_MODULES,
  MAX_SUMMARY_INSIGHT_MODULES,
  coerceShowInSummary,
} from "@/src/shared/constants/clinical-insights.constants"

export { MAX_AUTO_INSIGHT_MODULES, MAX_SUMMARY_INSIGHT_MODULES }

export type InsightPanelConfig = {
  id: string
  title: string
  prompt: string
  /** Whether this template is an active module rendered in Medical Summary. */
  showInSummary: boolean
  autoGenerate: boolean
  order: number
  audience: Audience
  /** Tracks one-time additions to the bundled template library. */
  templateLibraryRevision?: number
}

export const CLINICAL_INSIGHT_TEMPLATE_LIBRARY_REVISION = 1

const DEFAULT_PANELS_EN_MEDICAL: Omit<InsightPanelConfig, "audience">[] = [
  // NOTE: the legacy "safety" panel was removed — superseded by the dedicated
  // Safety Alerts locked tab (structured output + fixed UI).
  {
    id: "changes",
    title: "What's Changed",
    prompt:
      "Compare the patient's recent clinical data to prior information and list the most important changes in status, therapy, or results. Emphasize deltas that require attention.",
    showInSummary: true,
    autoGenerate: false,
    order: 0,
  },
  {
    id: "snapshot",
    title: "Clinical Snapshot",
    prompt:
      "Create a succinct clinical snapshot covering active problems, current therapies, recent results, and outstanding tasks. Keep it brief and actionable.",
    showInSummary: false,
    autoGenerate: false,
    order: 1,
  },
  {
    id: "standard-medical-summary-free-text",
    title: "Standard Medical Summary (Free Text)",
    prompt: `Write a concise cross-facility medical summary for a physician using the supplied clinical context. Return readable Markdown text only; do not return JSON, code, or a field-by-field object.

Use these headings in order, omitting a section when the record has no relevant data:
## One-line overview
## Cross-facility clinical course
## Active problems
## Key investigations and trends
## Medication review
## Major care timeline

Requirements:
- Stay factual and clinically concise. Use only information in the supplied record; include dates, facilities, values, and units when available. State uncertainty and important record limitations.
- Distinguish confirmed diagnoses in the Problem List or clinical documents from visit/claim ICD codes. Describe a claim-only condition as recorded on a claim, not as confirmed disease.
- For each active problem, briefly state its evidence. Merge duplicates and order by clinical importance.
- Select the 3–6 most relevant laboratory, pathology, or imaging topics. Show actual serial values when present; call something a trend only when there are at least two comparable time points. Do not invent missing tests or values.
- In Medication review, summarize the currently evidenced long-term regimen by treatment area, meaningful date/status-supported changes, and only concrete reconciliation questions tied to this patient's records. NHI prescribing or dispensing history does not prove current use or adherence; merge routine refills and prescribing-clinic/pharmacy duplicates.
- In the timeline, select about 5–8 major turning points rather than every routine visit or refill.
- Do not infer that absent data means absent care, and do not make unsupported diagnoses or treatment recommendations.`,
    showInSummary: false,
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
    showInSummary: true,
    autoGenerate: false,
    order: 0,
  },
  {
    id: "watch-out",
    title: "Things to Watch Out For",
    prompt:
      "Based on my health records, point out items that might deserve attention at my next medical visit — for example, abnormal lab values, medications that interact, vaccinations or screenings that look overdue. Do NOT diagnose; explain why each item matters in plain language and suggest I confirm with my doctor.",
    showInSummary: false,
    autoGenerate: false,
    order: 1,
  },
  {
    id: "questions-doctor",
    title: "Questions for My Doctor",
    prompt:
      "Based on my recent records, draft a concise list of questions I should ask at my next appointment. Cover medications, symptoms, abnormal results, and preventive care. Phrase the questions the way a patient would naturally ask them.",
    showInSummary: false,
    autoGenerate: false,
    order: 2,
  },
  {
    id: "standard-health-summary-free-text",
    title: "My Health Summary (Free Text)",
    prompt: `Using the supplied personal health records, write a calm, easy-to-read health summary for the patient. Return readable Markdown text only; do not return JSON, code, or a field-by-field object.

Use these headings in order, omitting a section when the record has no relevant data:
## My health at a glance
## My recent health journey
## Main health conditions
## Important tests and trends
## My medicines
## Major care timeline
## Questions to discuss with my care team

Requirements:
- Use everyday language at about a junior-high reading level and briefly explain necessary medical terms. Use only facts in the records; include dates and actual values when helpful.
- Distinguish confirmed conditions from diagnoses that appear only as visit/insurance claim codes. Clearly say when something is uncertain.
- For tests, describe the most relevant results and actual serial values. Call something a trend only when there are at least two comparable results; never invent missing tests or values.
- Explain how important recorded medicines may support care and give calm, practical reminders. The record does not prove that a medicine is still being taken. Never tell the patient to start, stop, skip, or change a dose.
- Select only major events for the timeline, not every routine visit or refill.
- Do not assume missing records mean missing care. Avoid alarming language, unsupported diagnoses, prognosis, or treatment advice; suggest discussing uncertainties with the care team.`,
    showInSummary: false,
    autoGenerate: false,
    order: 3,
  },
]

const DEFAULT_PANELS_ZH_MEDICAL: Omit<InsightPanelConfig, "audience">[] = [
  // 註：舊的「安全警示」面板已移除——由獨立的「安全警示」鎖定分頁取代（結構化輸出 + 固定 UI）。
  {
    id: "changes",
    title: "變化摘要",
    prompt:
      "比較病人最近的臨床資料與先前資訊，列出狀態、治療或結果中最重要的變化。強調需要注意的差異。",
    showInSummary: true,
    autoGenerate: false,
    order: 0,
  },
  {
    id: "snapshot",
    title: "臨床快照",
    prompt:
      "建立簡潔的臨床快照，涵蓋活動中的問題、目前治療、近期結果和待辦事項。保持簡短且可執行。",
    showInSummary: false,
    autoGenerate: false,
    order: 1,
  },
  {
    id: "standard-medical-summary-free-text",
    title: "標準醫療摘要（文字版）",
    prompt: `請根據提供的病人臨床資料，產生一份供醫師閱讀的跨院醫療摘要。只輸出清楚可讀的 Markdown 文字；不要輸出 JSON、程式碼或欄位物件。

依序使用以下標題；資料不足的段落可省略：
## 一句話總覽
## 跨院病程摘要
## 主要健康問題
## 重要檢查與趨勢
## 用藥整理
## 重大醫療時間軸

要求：
- 使用簡潔、專業的臨床語氣。只使用資料中的事實；有資料時列出日期、院所、數值與單位，並說明不確定性及重要的資料限制。
- 區分 Problem List 或臨床文件中的確認診斷，與門診／健保申報用的 ICD 碼。若只有申報碼，必須寫成「曾於申報紀錄出現」，不可當成已確認疾病。
- 每個主要健康問題簡述支持證據；合併重複項目，並依臨床重要性排序。
- 選擇 3–6 個最相關的檢驗、病理或影像主題。有序列資料時列出實際數值；至少有兩個可比時間點才稱為趨勢。不可虛構檢查或數值。
- 「用藥整理」要依治療領域整理目前有資料支持的長期用藥、有日期／狀態證據的重要變化，以及只屬於這位病人、有具體紀錄依據的用藥整合待確認項目。健保處方或調劑紀錄不等於目前仍在使用或有遵從性；合併例行續方，也不要把同一處方的醫院與調劑藥局當成重複用藥。
- 時間軸選擇約 5–8 個重要轉折，不要羅列每次例行回診或領藥。
- 不可將「沒有資料」解讀為「沒有就醫或治療」，也不要提出無資料支持的診斷或治療建議。`,
    showInSummary: false,
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
    showInSummary: true,
    autoGenerate: false,
    order: 0,
  },
  {
    id: "watch-out",
    title: "需要留意的事項",
    prompt:
      "根據我的健康資料，列出下次回診時可能值得留意的項目，例如：異常的檢驗值、可能交互作用的藥物、看起來逾期未做的疫苗或健檢。請不要做診斷，僅用白話文說明為什麼這些項目重要，並提醒我向醫師確認。",
    showInSummary: false,
    autoGenerate: false,
    order: 1,
  },
  {
    id: "questions-doctor",
    title: "可以問醫師的問題",
    prompt:
      "根據我的近期健康資料，幫我整理一份下次回診可以詢問醫師的問題清單，涵蓋用藥、症狀、異常檢驗值與預防性檢查。請用病人會自然問出口的口吻。",
    showInSummary: false,
    autoGenerate: false,
    order: 2,
  },
  {
    id: "standard-health-summary-free-text",
    title: "我的健康摘要（文字版）",
    prompt: `請根據提供的個人健康資料，產生一份讓病人容易理解、語氣平穩的健康摘要。只輸出清楚可讀的 Markdown 文字；不要輸出 JSON、程式碼或欄位物件。

依序使用以下標題；資料不足的段落可省略：
## 我的健康總覽
## 近期健康歷程
## 主要健康狀況
## 重要檢查與趨勢
## 我的用藥
## 重大醫療時間軸
## 可以與醫療團隊討論的問題

要求：
- 使用國中程度能理解的白話文，必要的醫學名詞要簡短解釋。只使用資料中的事實；有幫助時列出日期與實際數值。
- 區分已確認的健康問題，與只出現在就醫／健保申報碼的診斷；不確定時要清楚說明。
- 重要檢查要整理最相關的結果與實際序列數值。至少有兩個可比結果才稱為趨勢；不可虛構檢查或數值。
- 對重要的用藥，用白話說明紀錄中它可能支持的照護目標，並提供平穩、實用的提醒。紀錄不能證明目前仍在使用該藥；不可建議病人自行開始、停止、跳過或調整劑量。
- 時間軸只選擇重要事件，不要羅列每次例行回診或領藥。
- 不可將資料缺漏解讀為沒有接受照護。避免令人恐慌的用詞、無支持的診斷、預後或治療建議；不確定處建議與醫療團隊討論。`,
    showInSummary: false,
    autoGenerate: false,
    order: 3,
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
  return base.map((panel) => ({
    ...panel,
    audience,
    templateLibraryRevision: CLINICAL_INSIGHT_TEMPLATE_LIBRARY_REVISION,
  }))
}

function getAllDefaults(language: 'en' | 'zh-TW'): InsightPanelConfig[] {
  return [
    ...getDefaultsFor(language, 'medical'),
    ...getDefaultsFor(language, 'patient'),
  ]
}

const STANDARD_SUMMARY_TEMPLATE_ID: Record<Audience, string> = {
  medical: "standard-medical-summary-free-text",
  patient: "standard-health-summary-free-text",
}

/**
 * Add newly bundled library templates once per audience without resurrecting a
 * template the user later deletes. The revision is copied to every panel so it
 * survives account sync even after the bundled template itself is removed.
 */
export function migrateClinicalInsightTemplateLibrary(
  panels: InsightPanelConfig[],
  language: 'en' | 'zh-TW',
): { panels: InsightPanelConfig[]; changed: boolean } {
  let next = [...panels]
  let changed = false

  ;(['medical', 'patient'] as Audience[]).forEach((audience) => {
    const audiencePanels = next.filter((panel) => panel.audience === audience)
    if (audiencePanels.length === 0) return
    const isCurrent = audiencePanels.some(
      (panel) => (panel.templateLibraryRevision ?? 0) >= CLINICAL_INSIGHT_TEMPLATE_LIBRARY_REVISION,
    )
    if (isCurrent) return

    const bundledTemplate = getDefaultsFor(language, audience).find(
      (panel) => panel.id === STANDARD_SUMMARY_TEMPLATE_ID[audience],
    )
    if (bundledTemplate && !audiencePanels.some((panel) => panel.id === bundledTemplate.id)) {
      const nextOrder = Math.max(-1, ...audiencePanels.map((panel) => panel.order)) + 1
      next.push({ ...bundledTemplate, order: nextOrder })
    }
    next = next.map((panel) => panel.audience === audience
      ? { ...panel, templateLibraryRevision: CLINICAL_INSIGHT_TEMPLATE_LIBRARY_REVISION }
      : panel)
    changed = true
  })

  return { panels: next, changed }
}

function panelsEqualDefaults(panels: InsightPanelConfig[], language: 'en' | 'zh-TW', audience: Audience): boolean {
  const defaults = getDefaultsFor(language, audience)
  const current = panels.filter((p) => p.audience === audience).sort((a, b) => a.order - b.order)
  if (current.length !== defaults.length) return false
  return current.every((p, i) => {
    const d = defaults[i]
    return d && p.id === d.id && p.title === d.title && p.prompt === d.prompt &&
      p.showInSummary === d.showInSummary && p.autoGenerate === d.autoGenerate
  })
}

export function getDefaultClinicalInsightPanels(language: 'en' | 'zh-TW' = 'en', audience: Audience = 'medical'): InsightPanelConfig[] {
  return getDefaultsFor(language, audience)
}

type ClinicalInsightsConfigContextValue = {
  panels: InsightPanelConfig[]
  addPanel: (initial?: Partial<Pick<InsightPanelConfig, "title" | "prompt" | "showInSummary" | "autoGenerate">>) => string | null
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
      // Pre-v0.34 records had no placement flag. Only the high-value Changes
      // default is activated during migration; saved custom templates remain
      // in the library until the user explicitly adds them to the summary.
      showInSummary: coerceShowInSummary(c.showInSummary, c.id),
      autoGenerate: c.autoGenerate === true,
      order: typeof c.order === "number" ? c.order : fallbackOrder,
      audience: audienceValue,
      templateLibraryRevision: typeof c.templateLibraryRevision === "number"
        ? c.templateLibraryRevision
        : undefined,
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
        const sanitized = stripLegacySafetyPanels(
          parsed
            .map((e, i) => sanitizePanel(e, i))
            .filter((p): p is InsightPanelConfig => p !== null)
            .slice(0, MAX_PANELS),
        )

        const seen = new Set(sanitized.map((p) => p.audience))
        const merged = [...sanitized]
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (!seen.has(aud)) {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        const migrated = migrateClinicalInsightTemplateLibrary(merged, currentLang).panels
        const customMap: Record<Audience, boolean> = {
          medical: !panelsEqualDefaults(migrated, currentLang, 'medical'),
          patient: !panelsEqualDefaults(migrated, currentLang, 'patient'),
        }
        setAllPanels(migrated)
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
            const sanitized = stripLegacySafetyPanels(
              parsed
                .map((e, i) => sanitizePanel(e, i))
                .filter((p): p is InsightPanelConfig => p !== null)
                .slice(0, MAX_PANELS),
            )
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

    const unsubscribe = subscribeToClinicalInsightPanels(user.uid, (incoming: InsightPanelConfig[]) => {
      if (isSyncing) return
      // Keep one-time cleanup and bundled-template migrations idempotent. The
      // revision marker also means deleting a bundled template is respected.
      const updated = stripLegacySafetyPanels(incoming)
      if (updated.length === 0) {
        setAllPanels(getAllDefaults(currentLang))
        setCustomByAudience({ medical: false, patient: false })
        if (incoming.length > 0 && user?.uid) {
          setIsSyncing(true)
          replaceAllClinicalInsightPanels(user.uid, []).finally(() => setIsSyncing(false))
        }
      } else {
        const seen = new Set(updated.map((p) => p.audience))
        const merged: InsightPanelConfig[] = [...updated.slice(0, MAX_PANELS)]
        ;(['medical', 'patient'] as Audience[]).forEach((aud) => {
          if (!seen.has(aud)) {
            merged.push(...getDefaultsFor(currentLang, aud))
          }
        })
        const migration = migrateClinicalInsightTemplateLibrary(merged, currentLang)
        const customMap: Record<Audience, boolean> = {
          medical: !panelsEqualDefaults(migration.panels, currentLang, 'medical'),
          patient: !panelsEqualDefaults(migration.panels, currentLang, 'patient'),
        }
        setAllPanels(migration.panels)
        setCustomByAudience(customMap)

        if ((updated.length < incoming.length || migration.changed) && user?.uid) {
          setIsSyncing(true)
          const persist = updated.length < incoming.length
            ? replaceAllClinicalInsightPanels(user.uid, migration.panels)
            : batchSaveClinicalInsightPanels(user.uid, migration.panels)
          persist.finally(() => setIsSyncing(false))
        }
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

  const addPanel = (initial?: Partial<Pick<InsightPanelConfig, "title" | "prompt" | "showInSummary" | "autoGenerate">>) => {
    const audienceCount = allPanels.filter((p) => p.audience === audience).length
    if (audienceCount >= MAX_PANELS) return null
    const suffix = audienceCount + 1
    const newPanel: InsightPanelConfig = {
      id: generatePanelId(),
      title: initial?.title ?? `Custom Panel ${suffix}`,
      prompt: initial?.prompt ?? "Describe the key clinical insights for this focus area using the provided context.",
      showInSummary: initial?.showInSummary ?? false,
      autoGenerate: initial?.autoGenerate ?? false,
      order: audienceCount,
      audience,
      templateLibraryRevision: CLINICAL_INSIGHT_TEMPLATE_LIBRARY_REVISION,
    }
    setAllPanels((prev) => [...prev, newPanel])
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
    return newPanel.id
  }

  const normalizePatch = (patch: Partial<Omit<InsightPanelConfig, "audience">>) => {
    if (patch.showInSummary === false) return { ...patch, autoGenerate: false }
    if (patch.autoGenerate === true) return { ...patch, showInSummary: true }
    return patch
  }

  const applyConstrainedPatch = (
    source: InsightPanelConfig[],
    id: string,
    patch: Partial<Omit<InsightPanelConfig, "audience">>,
  ) => {
    const target = source.find((panel) => panel.id === id)
    if (!target) return source
    const normalized = normalizePatch(patch)
    const audiencePanels = source.filter((panel) => panel.audience === target.audience && panel.id !== id)
    if (
      normalized.showInSummary === true &&
      !target.showInSummary &&
      audiencePanels.filter((panel) => panel.showInSummary).length >= MAX_SUMMARY_INSIGHT_MODULES
    ) return source
    if (
      normalized.autoGenerate === true &&
      !target.autoGenerate &&
      audiencePanels.filter((panel) => panel.showInSummary && panel.autoGenerate).length >= MAX_AUTO_INSIGHT_MODULES
    ) return source
    return source.map((panel) => (
      panel.id === id
        ? { ...panel, ...normalized, id: panel.id, audience: panel.audience }
        : panel
    ))
  }

  const updatePanel = (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => {
    setAllPanels((prev) => applyConstrainedPatch(prev, id, patch))
    setCustomByAudience((prev) => ({ ...prev, [audience]: true }))
  }

  const updatePanelAndSave = async (id: string, patch: Partial<Omit<InsightPanelConfig, "audience">>) => {
    return new Promise<void>((resolve, reject) => {
      setAllPanels((prev) => {
        const updated = applyConstrainedPatch(prev, id, patch)

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
