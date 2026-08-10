import { create } from 'zustand'

interface MedcloudLaunchState {
  /** Non-secret delivery id waiting for the Medical Summary feature to become
   * data-ready. The decrypted API key lives only in ai-config's runtime-only
   * profile and is never copied into this queue. */
  pendingSummaryMessageId: string | null
  queueSummary: (messageId: string) => void
  claimSummary: (messageId: string) => boolean
  clear: () => void
}

export const useMedcloudLaunchStore = create<MedcloudLaunchState>((set, get) => ({
  pendingSummaryMessageId: null,
  queueSummary: (messageId) => {
    if (!messageId) return
    set({ pendingSummaryMessageId: messageId })
  },
  claimSummary: (messageId) => {
    if (get().pendingSummaryMessageId !== messageId) return false
    set({ pendingSummaryMessageId: null })
    return true
  },
  clear: () => set({ pendingSummaryMessageId: null }),
}))
