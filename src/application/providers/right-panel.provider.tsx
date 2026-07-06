"use client"

import { createContext, useContext, useState, type ReactNode } from 'react'

interface RightPanelContextType {
  activeTab: string
  setActiveTab: (tab: string, settingsSubTab?: string) => void
  settingsTab: string
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

  const setActiveTab = (tab: string, settingsSubTab?: string) => {
    setActiveTabState(tab)
    if (tab === 'settings' && settingsSubTab) {
      setSettingsTab(settingsSubTab)
    }
  }

  return (
    <RightPanelContext.Provider value={{ activeTab, setActiveTab, settingsTab }}>
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
