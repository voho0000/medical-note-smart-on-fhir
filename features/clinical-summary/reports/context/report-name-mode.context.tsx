"use client"

import { createContext, useContext, type ReactNode } from 'react'
import type { AnalyteNameMode } from '@/src/shared/utils/lab-normalize'

interface ReportNameModeContextValue {
  mode: AnalyteNameMode
  onChange?: (mode: AnalyteNameMode) => void
}

const ReportNameModeContext = createContext<ReportNameModeContextValue>({
  mode: 'standardized',
})

export function ReportNameModeProvider({
  value,
  onChange,
  children,
}: {
  value: AnalyteNameMode
  onChange?: (mode: AnalyteNameMode) => void
  children: ReactNode
}) {
  return (
    <ReportNameModeContext.Provider value={{ mode: value, onChange }}>
      {children}
    </ReportNameModeContext.Provider>
  )
}

/**
 * Name display preference scoped to the reports card. Standalone report
 * components (stories/tests/other entry points) keep today's standardized
 * labels through the context default.
 */
export function useReportNameMode(): AnalyteNameMode {
  return useContext(ReportNameModeContext).mode
}

export function useReportNameModeControl(): ReportNameModeContextValue {
  return useContext(ReportNameModeContext)
}
