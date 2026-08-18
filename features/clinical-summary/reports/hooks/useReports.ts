// Feature-specific Hook: Reports Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useReports() {
  const {
    diagnosticReports = [],
    observations = [],
    procedures = [],
    resourceReady,
    error,
  } = useClinicalData()
  // Reports read three types; report rows would look empty if any were still
  // in flight, so this gate is their union rather than the whole chart.
  const isLoading = !resourceReady.diagnosticReports
    || !resourceReady.observations
    || !resourceReady.procedures
  return { diagnosticReports, observations, procedures, isLoading, error }
}
