// Legacy Provider Bridge - 提供向後兼容的 API
"use client"

import { usePatient as usePatientNew } from '@/src/application/providers/patient.provider'
import { useClinicalData as useClinicalDataNew } from '@/src/application/providers/clinical-data.provider'
import { useApiKey as useApiKeyNew } from '@/src/application/providers/api-key.provider'
import { useDataSelection as useDataSelectionNew } from '@/src/application/providers/data-selection.provider'

// Re-export with legacy names for backward compatibility
export { usePatientNew as usePatient }
export { useClinicalDataNew as useClinicalData }
export { useApiKeyNew as useApiKey }
export { useDataSelectionNew as useDataSelection }

// Legacy hook adapters for features that haven't been migrated yet
export function useLegacyPatient() {
  const { patient, loading, error } = usePatientNew()
  return { patient, loading, error }
}

export function useLegacyClinicalData() {
  const data = useClinicalDataNew()
  return {
    diagnoses: data.conditions,
    medications: data.medications,
    allergies: data.allergies,
    vitals: data.vitalSigns,
    vitalSigns: data.vitalSigns,
    observations: data.observations,
    diagnosticReports: data.diagnosticReports,
    procedures: data.procedures,
    encounters: data.encounters,
    isLoading: data.isLoading,
    error: data.error
  }
}
