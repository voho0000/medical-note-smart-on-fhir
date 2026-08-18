// Feature-specific Hook: Diagnosis Data
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"

export function useDiagnosis() {
  // Gate on Condition alone: the chart loads one query per resource type, so
  // waiting for the global isLoading would hold this list back until the
  // slowest search (Observation) finished.
  const { conditions = [], resourceReady, error } = useClinicalData()
  return { conditions, isLoading: !resourceReady.conditions, error }
}
