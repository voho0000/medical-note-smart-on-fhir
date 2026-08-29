import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  gateModelForKeys,
  getModelDefinition,
  MODEL_ROLE_IDS,
} from '@/src/shared/constants/ai-models.constants'
import type { ProviderKeys } from '@/src/shared/utils/model-access.utils'

export const REPORT_INTERPRETATION_DEFAULT_MODEL_ID =
  MODEL_ROLE_IDS['report-interpretation']
export const REPORT_INTERPRETATION_CUSTOM_PROMPT_MAX_LENGTH = 4000
export const REPORT_INTERPRETATION_DEFAULT_PROMPTS = Object.freeze({
  'zh-TW':
    '請忠實翻譯這份臨床文件，並依目前的使用者身分，以清楚、冷靜且容易理解的方式解讀。' +
    '優先說明文件目的、重要發現、醫學名詞的意義，以及值得在後續回診確認的事項。' +
    '不要加入原文沒有的診斷、數據、預後或治療建議；若資料不足，請明確說明。',
  en:
    'Faithfully translate this clinical document and interpret it for the current audience in clear, calm, and accessible language. ' +
    'Prioritize the document purpose, important findings, the meaning of clinical terms, and anything worth confirming at follow-up. ' +
    'Do not add diagnoses, measurements, prognosis, or treatment advice that are not in the source; state plainly when information is insufficient.',
})

export function defaultReportInterpretationPrompt(
  locale: 'en' | 'zh-TW',
): string {
  return REPORT_INTERPRETATION_DEFAULT_PROMPTS[locale]
}

export function resolveReportInterpretationPrompt(
  promptOverride: string,
  locale: 'en' | 'zh-TW',
): string {
  return promptOverride.trim() || defaultReportInterpretationPrompt(locale)
}

export function isReportInterpretationModel(modelId: string): boolean {
  const definition = getModelDefinition(modelId)
  return Boolean(
    definition &&
    definition.status === 'available' &&
    definition.selectable,
  )
}

export function resolveReportInterpretationModel(
  preferredModelId: string,
  keys: ProviderKeys,
): string {
  if (!isReportInterpretationModel(preferredModelId)) {
    return REPORT_INTERPRETATION_DEFAULT_MODEL_ID
  }
  return gateModelForKeys(
    preferredModelId,
    keys,
    REPORT_INTERPRETATION_DEFAULT_MODEL_ID,
  )
}

function normalizeCustomPrompt(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value
    .slice(0, REPORT_INTERPRETATION_CUSTOM_PROMPT_MAX_LENGTH)
    .trim()
  if (Object.values(REPORT_INTERPRETATION_DEFAULT_PROMPTS).includes(normalized)) {
    return ''
  }
  return normalized
}

interface ReportInterpretationPrefsState {
  modelId: string
  customPrompt: string
  setModelId: (modelId: string) => void
  setCustomPrompt: (prompt: string) => void
  reset: () => void
}

export const useReportInterpretationPrefsStore =
  create<ReportInterpretationPrefsState>()(
    persist(
      (set) => ({
        modelId: REPORT_INTERPRETATION_DEFAULT_MODEL_ID,
        customPrompt: '',
        setModelId: (modelId) => set({
          modelId: isReportInterpretationModel(modelId)
            ? modelId
            : REPORT_INTERPRETATION_DEFAULT_MODEL_ID,
        }),
        setCustomPrompt: (customPrompt) => set({
          customPrompt: normalizeCustomPrompt(customPrompt),
        }),
        reset: () => set({
          modelId: REPORT_INTERPRETATION_DEFAULT_MODEL_ID,
          customPrompt: '',
        }),
      }),
      {
        name: 'report-interpretation-prefs',
        onRehydrateStorage: () => (state) => {
          if (!state) return
          if (!isReportInterpretationModel(state.modelId)) {
            state.modelId = REPORT_INTERPRETATION_DEFAULT_MODEL_ID
          }
          state.customPrompt = normalizeCustomPrompt(state.customPrompt)
        },
      },
    ),
  )
