// Feature-specific Hook: Medications Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useMedications() {
  const { medications = [], resourceReady, error } = useClinicalData()
  return { medications, isLoading: !resourceReady.medications, error }
}
