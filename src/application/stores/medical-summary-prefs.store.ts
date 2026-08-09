import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import { MEDICAL_SUMMARY_MODEL_ID } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'

interface SummaryPrefsStore {
  autoGenerate: boolean
  setAutoGenerate: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}

export const useSummaryPrefsStore = createModelPrefsStore<SummaryPrefsStore>({
  storageName: 'medical-summary-prefs',
  defaultModelId: MEDICAL_SUMMARY_MODEL_ID,
  initializer: (set) => ({
    // Real-patient auto-run remains opt-in and separately consent-gated.
    autoGenerate: false,
    setAutoGenerate: (value) => set({ autoGenerate: value }),
    modelId: MEDICAL_SUMMARY_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})
