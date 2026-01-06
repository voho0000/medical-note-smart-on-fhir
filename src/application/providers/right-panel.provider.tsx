"use client"

import { createContext, useContext, useState, type ReactNode } from 'react'

interface RightPanelContextType {
  activeTab: string
  setActiveTab: (tab: string, settingsSubTab?: string) => void
  settingsTab: string
}

const RightPanelContext = createContext<RightPanelContextType | undefined>(undefined)

export function RightPanelProvider({ children, defaultTab }: { children: ReactNode; defaultTab: string }) {
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
