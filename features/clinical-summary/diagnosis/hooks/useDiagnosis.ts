// Feature-specific Hook: Diagnosis Data
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export function useDiagnosis() {
  const { conditions = [], isLoading, error } = useClinicalData()
  return { conditions, isLoading, error }
}
