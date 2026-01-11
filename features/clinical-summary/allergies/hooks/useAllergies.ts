// Feature-specific Hook: Allergies Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useAllergies() {
  const { allergies = [], isLoading, error } = useClinicalData()
  return { allergies, isLoading, error }
}
