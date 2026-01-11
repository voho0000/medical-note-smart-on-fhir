// Feature-specific Hook: Medications Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useMedications() {
  const { medications = [], isLoading, error } = useClinicalData()
  return { medications, isLoading, error }
}
