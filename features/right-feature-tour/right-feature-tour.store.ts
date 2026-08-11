'use client'

import { create } from 'zustand'

export const RIGHT_FEATURE_TOUR_STORAGE_KEY = 'medical-note-right-feature-tour-v1'

export type RightFeatureTourStepId =
  | 'overview'
  | 'summary'
  | 'summary-settings'
  | 'chat'
  | 'chat-compose'
  | 'chat-template'
  | 'calculator'
  | 'guidance'
  | 'export'
  | 'settings'
  | 'finish'

interface RightFeatureTourState {
  active: boolean
  stepId: RightFeatureTourStepId | null
  session: number
  start: () => void
  setStep: (stepId: RightFeatureTourStepId) => void
  stop: () => void
}

export const useRightFeatureTourStore = create<RightFeatureTourState>((set) => ({
  active: false,
  stepId: null,
  session: 0,
  start: () => set((state) => ({
    active: true,
    stepId: 'overview',
    session: state.session + 1,
  })),
  setStep: (stepId) => set({ stepId }),
  stop: () => set({ active: false, stepId: null }),
}))

export function markRightFeatureTourSeen(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RIGHT_FEATURE_TOUR_STORAGE_KEY, '1')
  } catch {
    // Best effort. The running tour still closes when persistence is blocked.
  }
}
