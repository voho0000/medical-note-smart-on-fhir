// Feature-specific Hook: Diagnosis Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useDiagnosis() {
  const { conditions = [], isLoading, error } = useClinicalData()
  return { conditions, isLoading, error }
}
