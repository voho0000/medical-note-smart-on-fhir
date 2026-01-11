// Feature-specific Hook: Vitals Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useVitals() {
  const { vitalSigns = [], isLoading, error } = useClinicalData()
  return { vitalSigns, isLoading, error }
}
