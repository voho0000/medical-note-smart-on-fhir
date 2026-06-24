// First-run onboarding gate.
//
// `completed` is true on SSR / first render (assume done) to avoid a flash of
// the dialog before localStorage is read — same flicker-avoidance the audience
// provider uses. The real value is read on mount.
"use client"

import { useEffect, useState } from 'react'
import { ONBOARDING_STORAGE_KEY } from '@/src/shared/constants/onboarding.constants'

export interface UseOnboardingReturn {
  /** True once the user has been through (or skipped) the first-run flow. */
  completed: boolean
  /** Persist completion so the flow never shows again (for this version). */
  markComplete: () => void
}

export function useOnboarding(): UseOnboardingReturn {
  const [completed, setCompleted] = useState(true) // assume done on SSR to avoid flicker

  useEffect(() => {
    try {
      setCompleted(localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1')
    } catch {
      // localStorage unavailable (private mode / SSR) — treat as completed so we
      // never trap the user behind a dialog we can't dismiss persistently.
      setCompleted(true)
    }
  }, [])

  const markComplete = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    } catch {
      // best-effort; UI still advances via state below
    }
    setCompleted(true)
  }

  return { completed, markComplete }
}
