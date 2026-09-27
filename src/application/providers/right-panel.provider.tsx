"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface OpenAiCompatibleContextWindowTarget {
  kind: 'openai-compatible-context-window'
  /** Exact custom connection whose editable token window should be revealed. */
  profileId?: string
}

export type SettingsNavigationTarget =
  | 'openai-compatible-context-window'
  | 'openai-compatible-add-profile'
  | OpenAiCompatibleContextWindowTarget

export function isOpenAiCompatibleContextWindowTarget(
  target: SettingsNavigationTarget | null | undefined,
): boolean {
  return target === 'openai-compatible-context-window' ||
    (typeof target === 'object' && target?.kind === 'openai-compatible-context-window')
}

export function isOpenAiCompatibleAddProfileTarget(
  target: SettingsNavigationTarget | null | undefined,
): target is 'openai-compatible-add-profile' {
  return target === 'openai-compatible-add-profile'
}

interface RightPanelContextType {
  activeTab: string
  setActiveTab: (
    tab: string,
    settingsSubTab?: string,
    settingsTarget?: SettingsNavigationTarget,
  ) => void
  settingsTab: string
  settingsTarget: SettingsNavigationTarget | null
  clearSettingsTarget: () => void
  /** Open a tab AND make the right panel visible — the phone layout flips to
   *  「功能」 and a collapsed desktop panel reopens. For a control in the
   *  clinical summary that sends the reader to a right-panel task. */
  revealTab: (tab: string) => void
  /** Increments on every revealTab call; the page layout watches it. */
  revealSeq: number
}

const RightPanelContext = createContext<RightPanelContextType | undefined>(undefined)

// `defaultTab` is optional now — promoted to app-level provider in v0.4.0
// so the header can navigate to Settings sub-tabs. AppProviders doesn't
// know the feature registry; the default is 'medical-summary' (open the
// patient → see the AI briefing). If that feature is unplugged in the
// registry, RightPanelLayout falls back to the first enabled feature.
export function RightPanelProvider({ children, defaultTab = 'medical-summary' }: { children: ReactNode; defaultTab?: string }) {
  const [activeTab, setActiveTabState] = useState(defaultTab)
  const [settingsTab, setSettingsTab] = useState('ai')
  const [settingsTarget, setSettingsTarget] = useState<SettingsNavigationTarget | null>(null)
  const [revealSeq, setRevealSeq] = useState(0)

  const setActiveTab = useCallback((
    tab: string,
    settingsSubTab?: string,
    target?: SettingsNavigationTarget,
  ) => {
    setActiveTabState(tab)
    if (tab === 'settings') {
      if (settingsSubTab) setSettingsTab(settingsSubTab)
      else if (target) setSettingsTab('ai')
      setSettingsTarget(target ?? null)
    } else {
      setSettingsTarget(null)
    }
  }, [])

  const clearSettingsTarget = useCallback(() => setSettingsTarget(null), [])

  const revealTab = useCallback((tab: string) => {
    setActiveTab(tab)
    setRevealSeq((seq) => seq + 1)
  }, [setActiveTab])

  return (
    <RightPanelContext.Provider value={{
      activeTab,
      setActiveTab,
      settingsTab,
      settingsTarget,
      clearSettingsTarget,
      revealTab,
      revealSeq,
    }}>
      {children}
    </RightPanelContext.Provider>
  )
}

export function useRightPanel() {
  const context = useContext(RightPanelContext)
  if (!context) {
    throw new Error('useRightPanel must be used within a RightPanelProvider')
  }
  return context
}
