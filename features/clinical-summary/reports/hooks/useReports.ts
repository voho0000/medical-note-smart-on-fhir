// Feature-specific Hook: Reports Data
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export function useReports() {
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()
  return { diagnosticReports, observations, procedures, isLoading, error }
}
