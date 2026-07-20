"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type SettingsNavigationTarget = 'openai-compatible-context-window'

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

  return (
    <RightPanelContext.Provider value={{
      activeTab,
      setActiveTab,
      settingsTab,
      settingsTarget,
      clearSettingsTarget,
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
