// Feature-specific Hook: Allergies Data
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export function useAllergies() {
  const { allergies = [], isLoading, error } = useClinicalData()
  return { allergies, isLoading, error }
}
