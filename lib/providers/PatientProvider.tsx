"use client"

import { createContext, useContext, useMemo } from "react"
import { useSmartPatient } from "@/lib/fhir/useSmartPatient"

type PatientContextValue = ReturnType<typeof useSmartPatient>

const PatientCtx = createContext<PatientContextValue | null>(null)

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const value = useSmartPatient()
  // 依照關心的欄位做 memo，避免不必要 re-render
  const memo = useMemo(
    () => value,
    [value.patient, value.loading, value.error]
  )

  return <PatientCtx.Provider value={memo}>{children}</PatientCtx.Provider>
}

export function usePatient() {
  const ctx = useContext(PatientCtx)
  if (!ctx) {
    throw new Error("usePatient must be used within <PatientProvider>")
  }
  return ctx
}
