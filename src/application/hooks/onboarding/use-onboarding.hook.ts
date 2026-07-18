// First-run onboarding gate.
//
// `completed` is true on SSR / hydration (assume done) to avoid a flash of the
// dialog before localStorage is available. useSyncExternalStore then publishes
// the browser snapshot and keeps same-tab completion updates reactive.
"use client"

import { useSyncExternalStore } from 'react'
import { ONBOARDING_STORAGE_KEY } from '@/src/shared/constants/onboarding.constants'

const ONBOARDING_CHANGED_EVENT = 'mediprisma:onboarding-changed'
let volatileCompleted = false

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(ONBOARDING_CHANGED_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(ONBOARDING_CHANGED_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

function getCompletedSnapshot(): boolean {
  try {
    return volatileCompleted || localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
  } catch {
    // If storage is unavailable, never trap the user behind a dialog whose
    // completion cannot be persisted.
    return true
  }
}

export interface UseOnboardingReturn {
  /** True after the browser's persisted onboarding state has been read. */
  ready: boolean
  /** True once the user has been through (or skipped) the first-run flow. */
  completed: boolean
  /** Persist completion so the flow never shows again (for this version). */
  markComplete: () => void
}

export function useOnboarding(): UseOnboardingReturn {
  const completed = useSyncExternalStore(subscribe, getCompletedSnapshot, () => true)
  const ready = useSyncExternalStore(subscribe, () => true, () => false)

  const markComplete = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    } catch {
      // Release the current UI even if persistence is unavailable. A reload may
      // show the flow again, but the user is never trapped in this session.
      volatileCompleted = true
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT))
    }
  }

  return { ready, completed, markComplete }
}
