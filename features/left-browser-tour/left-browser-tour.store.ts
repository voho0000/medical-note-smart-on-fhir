'use client'

import { create } from 'zustand'

export const LEFT_BROWSER_TOUR_STORAGE_KEY = 'medical-note-left-browser-tour-v1'

export type LeftBrowserTourStepId =
  | 'overview'
  | 'visits'
  | 'reports'
  | 'trend'
  | 'imaging-ai'
  | 'medications'
  | 'medication-timeline'
  | 'right-pane'
  | 'documents'
  | 'finish'

interface LeftBrowserTourState {
  active: boolean
  stepId: LeftBrowserTourStepId | null
  session: number
  start: () => void
  setStep: (stepId: LeftBrowserTourStepId) => void
  stop: () => void
}

export const useLeftBrowserTourStore = create<LeftBrowserTourState>((set) => ({
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

export function hasSeenLeftBrowserTour(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(LEFT_BROWSER_TOUR_STORAGE_KEY) === '1'
  } catch {
    // Storage being unavailable must not trap the user in a recurring tour.
    return true
  }
}

export function markLeftBrowserTourSeen(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LEFT_BROWSER_TOUR_STORAGE_KEY, '1')
  } catch {
    // Best effort. The running tour still closes even when persistence fails.
  }
}
