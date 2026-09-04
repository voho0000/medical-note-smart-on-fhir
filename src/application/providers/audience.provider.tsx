// Audience Provider — switches default prompts between medical professional and patient/citizen perspectives.
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AUDIENCE_CHANGED_EVENT } from './font-size.provider'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { setUserProps } from '@/src/application/telemetry/usage-analytics'
import { useTourAnalytics } from '@/src/shared/config/tour-analytics'
import { usePreferenceProps } from '@/src/application/telemetry/use-preference-props'

export type Audience = 'medical' | 'patient'

interface AudienceContextType {
  audience: Audience
  setAudience: (audience: Audience) => void
  hasSelected: boolean
}

const AudienceContext = createContext<AudienceContextType | undefined>(undefined)

const AUDIENCE_STORAGE_KEY = 'medical-note-audience'
const AUDIENCE_SELECTED_KEY = 'medical-note-audience-selected'
const DEFAULT_AUDIENCE: Audience = 'medical'

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [audience, setAudienceState] = useState<Audience>(DEFAULT_AUDIENCE)
  const [hasSelected, setHasSelected] = useState<boolean>(true) // assume true on SSR to avoid flicker

  useEffect(() => {
    // The Medcloud launch always opens in clinician mode. A 民眾 choice made
    // on an earlier visit must not follow the doctor into the hand-off; it
    // stays in storage and applies again outside this route.
    // `hasSelected` already defaults to true, so leaving both states at their
    // initial values is exactly the clinician-mode entry we want here.
    if (isMedcloudLaunchRoute()) return
    const stored = localStorage.getItem(AUDIENCE_STORAGE_KEY)
    if (stored === 'medical' || stored === 'patient') {
      // Restore after hydration so persisted browser state cannot make the
      // first client render diverge from the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudienceState(stored)
    }
    setHasSelected(localStorage.getItem(AUDIENCE_SELECTED_KEY) === '1')
  }, [])

  // Usage analytics: the guided-tour store subscription needs a host that is
  // mounted for the whole session and exactly once. This provider is it —
  // app/page.tsx (where the tours render) is a busier file and mounting there
  // buys nothing.
  useTourAnalytics()
  // Same host, same reason: mounted for the whole session and exactly once.
  // NOTE: this makes LanguageProvider a REQUIREMENT of AudienceProvider — the
  // `locale` property reads useLanguage(). app-providers.tsx already nests them
  // that way; a test that renders AudienceProvider alone must wrap it too.
  usePreferenceProps()

  // Usage analytics: reported from here rather than from auth.provider so the
  // value is the one actually in effect — the Medcloud route forces clinician
  // mode regardless of what an earlier visit persisted.
  useEffect(() => {
    setUserProps({ audience })
  }, [audience])

  const setAudience = useCallback((next: Audience) => {
    setAudienceState(next)
    localStorage.setItem(AUDIENCE_STORAGE_KEY, next)
    localStorage.setItem(AUDIENCE_SELECTED_KEY, '1')
    setHasSelected(true)
    // FontSizeProvider sits above this one and cannot consume the context, so
    // it listens for this instead: patients must not inherit the clinician's
    // 12px phone root (audit C1).
    window.dispatchEvent(new CustomEvent(AUDIENCE_CHANGED_EVENT))
  }, [])

  // Audience drives label/density decisions deep in the tree. A fresh value
  // object per render re-rendered every consumer on unrelated parent state.
  const value = useMemo<AudienceContextType>(
    () => ({ audience, setAudience, hasSelected }),
    [audience, setAudience, hasSelected],
  )

  return (
    <AudienceContext.Provider value={value}>
      {children}
    </AudienceContext.Provider>
  )
}

export function useAudience() {
  const ctx = useContext(AudienceContext)
  if (!ctx) {
    throw new Error('useAudience must be used within an AudienceProvider')
  }
  return ctx
}
