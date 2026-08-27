import { create } from 'zustand'

export interface MedcloudSummaryRequest {
  /** Non-secret Extension delivery id. */
  messageId: string
  /** Exact model selected by the independent site-routing decision. */
  modelId: string
}

interface MedcloudLaunchState {
  /** Request waiting for the Medical Summary feature to become data-ready.
   * The decrypted credential lives only in ai-config when the VGH site is
   * active and is never copied into this queue. */
  pendingSummary: MedcloudSummaryRequest | null
  queueSummary: (request: MedcloudSummaryRequest) => void
  claimSummary: (messageId: string) => boolean
  clear: () => void
}

export const useMedcloudLaunchStore = create<MedcloudLaunchState>((set, get) => ({
  pendingSummary: null,
  queueSummary: (request) => {
    if (!request.messageId || !request.modelId) return
    set({ pendingSummary: request })
  },
  claimSummary: (messageId) => {
    if (get().pendingSummary?.messageId !== messageId) return false
    set({ pendingSummary: null })
    return true
  },
  clear: () => set({ pendingSummary: null }),
}))
