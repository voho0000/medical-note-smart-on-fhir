// Feature-specific Hook: Vitals Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useVitals() {
  // Vitals are the vital-signs subset of the Observation search rather than a
  // search of their own, so readiness tracks the observations query.
  const { vitalSigns = [], resourceReady, error } = useClinicalData()
  return { vitalSigns, isLoading: !resourceReady.vitalSigns, error }
}
