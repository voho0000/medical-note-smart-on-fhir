import { useMemo } from 'react'
import {
  calculateReportTabCounts,
  type ReportTabCounts,
} from '../utils/report-tab-counts'

/**
 * Memoized lightweight Reports tab counts.
 *
 * The source arrays are referentially stable in useClinicalData, so unrelated
 * UI state changes do not repeat the count scan.
 */
export function useReportTabCounts(
  diagnosticReports: any[] = [],
  imagingStudies: any[] = [],
  observations: any[] = [],
  procedures: any[] = [],
): ReportTabCounts {
  return useMemo(
    () => calculateReportTabCounts(
      diagnosticReports,
      imagingStudies,
      observations,
      procedures,
    ),
    [diagnosticReports, imagingStudies, observations, procedures],
  )
}
