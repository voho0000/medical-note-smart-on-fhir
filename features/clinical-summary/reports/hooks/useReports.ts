// Feature-specific Hook: Reports Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useReports() {
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()
  return { diagnosticReports, observations, procedures, isLoading, error }
}
