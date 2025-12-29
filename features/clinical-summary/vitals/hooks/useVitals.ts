// Feature-specific Hook: Vitals Data
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export function useVitals() {
  const { vitalSigns = [], isLoading, error } = useClinicalData()
  return { vitalSigns, isLoading, error }
}
