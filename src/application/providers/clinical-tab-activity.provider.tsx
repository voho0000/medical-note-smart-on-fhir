"use client"

import { createContext, useContext, type ReactNode } from "react"

const ClinicalTabActivityContext = createContext(true)

export function ClinicalTabActivityProvider({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <ClinicalTabActivityContext.Provider value={active}>
      {children}
    </ClinicalTabActivityContext.Provider>
  )
}

/** True only while this feature's top-level clinical tab is visible. */
export function useClinicalTabActivity() {
  return useContext(ClinicalTabActivityContext)
}
