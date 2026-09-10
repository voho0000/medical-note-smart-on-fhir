"use client"

// Lets a feature INSIDE a panel act on the workspace split that contains it —
// today only 「專注總覽」, which collapses the AI feature panel so the overview
// gets the whole width.
//
// A context rather than a store: the collapse state belongs to the page shell
// (the tour saves and restores it, the mobile switcher ignores it), and a
// second source of truth for it would be a bug waiting to happen. Features
// outside the workspace — and every unit test that renders one on its own —
// get `null` from the hook and simply render without the control.
import { createContext, useContext, useMemo, type ReactNode } from "react"

export type CollapsedPanel = 'left' | 'right' | null

interface WorkspacePanelsValue {
  collapsed: CollapsedPanel
  setCollapsed: (panel: CollapsedPanel) => void
}

const WorkspacePanelsContext = createContext<WorkspacePanelsValue | null>(null)

export function WorkspacePanelsProvider({
  collapsed,
  setCollapsed,
  children,
}: WorkspacePanelsValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ collapsed, setCollapsed }),
    [collapsed, setCollapsed],
  )
  return (
    <WorkspacePanelsContext.Provider value={value}>
      {children}
    </WorkspacePanelsContext.Provider>
  )
}

/** `null` outside the workspace shell — callers must render without it. */
export function useWorkspacePanels(): WorkspacePanelsValue | null {
  return useContext(WorkspacePanelsContext)
}
