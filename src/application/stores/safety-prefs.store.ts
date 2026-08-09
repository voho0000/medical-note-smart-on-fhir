import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import { SAFETY_ALERTS_MODEL_ID } from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'

interface SafetyPrefsStore {
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}

export const useSafetyPrefsStore = createModelPrefsStore<SafetyPrefsStore>({
  storageName: 'safety-alerts-prefs',
  defaultModelId: SAFETY_ALERTS_MODEL_ID,
  initializer: (set) => ({
    // Real-patient auto-run remains opt-in and separately consent-gated.
    autoScan: false,
    setAutoScan: (value) => set({ autoScan: value }),
    modelId: SAFETY_ALERTS_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})
