// Audience Provider — switches default prompts between medical professional and patient/citizen perspectives.
"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

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
    const stored = localStorage.getItem(AUDIENCE_STORAGE_KEY)
    if (stored === 'medical' || stored === 'patient') {
      setAudienceState(stored)
    }
    setHasSelected(localStorage.getItem(AUDIENCE_SELECTED_KEY) === '1')
  }, [])

  const setAudience = (next: Audience) => {
    setAudienceState(next)
    localStorage.setItem(AUDIENCE_STORAGE_KEY, next)
    localStorage.setItem(AUDIENCE_SELECTED_KEY, '1')
    setHasSelected(true)
  }

  return (
    <AudienceContext.Provider value={{ audience, setAudience, hasSelected }}>
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
