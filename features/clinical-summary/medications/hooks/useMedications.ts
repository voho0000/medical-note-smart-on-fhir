// Feature-specific Hook: Medications Data
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export function useMedications() {
  const { medications = [], isLoading, error } = useClinicalData()
  return { medications, isLoading, error }
}
