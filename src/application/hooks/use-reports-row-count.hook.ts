import { useMemo } from "react"
import { calculateReportsRowCounts, type ReportsRowCounts, type ReportFilters } from "@/src/shared/utils/reports-count.utils"

/**
 * Hook to calculate report row counts
 * Wraps the utility function in useMemo for performance
 */
export function useReportsRowCount(
  diagnosticReports: any[],
  observations: any[],
  procedures: any[],
  filters?: ReportFilters
): ReportsRowCounts {
  return useMemo(
    () => calculateReportsRowCounts(diagnosticReports, observations, procedures, filters),
    [diagnosticReports, observations, procedures, filters]
  )
}
