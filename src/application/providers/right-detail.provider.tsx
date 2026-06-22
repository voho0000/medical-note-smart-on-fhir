// Right-pane detail slot.
//
// Lets a left-panel card push its expanded detail into the RIGHT panel instead
// of expanding downward — so the user sees list (left) + detail (right) at once,
// reusing the space that the AI feature column would otherwise just leave wider.
// While a detail is shown the AI RightPanelFeature is temporarily replaced; ✕
// (clearDetail) returns to it. Only one detail at a time.
"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export interface RightDetail {
  /** Header shown above the detail (e.g. the visit's date + type). */
  title: ReactNode
  /** The detail body to render in the right pane. */
  node: ReactNode
  /** Stable id of what's shown, so a card can mark its row as "active" and a
   *  second click on the same row can toggle it closed. */
  sourceId: string
}

interface RightDetailContextValue {
  detail: RightDetail | null
  showDetail: (detail: RightDetail) => void
  /** Show, or close if the same sourceId is already shown (toggle). */
  toggleDetail: (detail: RightDetail) => void
  clearDetail: () => void
}

const RightDetailContext = createContext<RightDetailContextValue | null>(null)

export function RightDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<RightDetail | null>(null)

  const showDetail = useCallback((next: RightDetail) => setDetail(next), [])
  const clearDetail = useCallback(() => setDetail(null), [])
  const toggleDetail = useCallback(
    (next: RightDetail) => setDetail((cur) => (cur?.sourceId === next.sourceId ? null : next)),
    [],
  )

  const value = useMemo(
    () => ({ detail, showDetail, toggleDetail, clearDetail }),
    [detail, showDetail, toggleDetail, clearDetail],
  )
  return <RightDetailContext.Provider value={value}>{children}</RightDetailContext.Provider>
}

export function useRightDetail(): RightDetailContextValue {
  const ctx = useContext(RightDetailContext)
  if (!ctx) throw new Error("useRightDetail must be used within RightDetailProvider")
  return ctx
}
