/**
 * Clinical Data Query Hook (React Query)
 * 
 * Replaces ClinicalDataProvider with React Query for better server state management.
 * 
 * Benefits:
 * - Automatic caching and background refetching
 * - No unnecessary re-renders
 * - Built-in loading and error states
 * - Dependent queries (waits for patient data)
 */

import { useQuery } from '@tanstack/react-query'
import { FetchClinicalDataUseCase } from '@/src/core/use-cases/clinical-data/fetch-clinical-data.use-case'
import { getClinicalDataRepository } from '@/src/application/composition'
import { LocalBundleModeError } from '@/src/infrastructure/fhir/client/fhir-client.service'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { usePatientQuery } from '../patient/use-patient-query.hook'

const BLOCKING_FHIR_QUERY_KEYS = new Set([
  'Condition',
  'MedicationRequest',
  'AllergyIntolerance',
  'Observation',
  'DiagnosticReport',
  'Encounter',
])

export function useClinicalDataQuery() {
  const { data: patient, isLoading: patientLoading } = usePatientQuery()

  return useQuery({
    queryKey: ['clinical-data', patient?.id],
    queryFn: async (): Promise<ClinicalDataCollection> => {
      if (!patient?.id) {
        throw new Error('Patient ID is required')
      }

      const repository = await getClinicalDataRepository()
      const useCase = new FetchClinicalDataUseCase(repository)
      try {
        return await useCase.execute(patient.id)
      } catch (error) {
        // SMART client became unavailable mid-fetch (race against clear/import).
        // Return an empty collection so panels render the empty state instead
        // of surfacing this as an error.
        if (error instanceof LocalBundleModeError) {
          return {
            conditions: [], medications: [], allergies: [], observations: [],
            vitalSigns: [], diagnosticReports: [], imagingStudies: [], procedures: [], encounters: [],
            documentReferences: [], compositions: [], immunizations: [],
            consents: [], devices: [], carePlans: [],
          }
        }
        throw error
      }
    },
    enabled: !!patient?.id && !patientLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

// Backward compatibility hook that matches the old ClinicalDataProvider API
export function useClinicalData() {
  const { isLoading: patientLoading } = usePatientQuery()
  const { data, isLoading: clinicalDataLoading, error, refetch } = useClinicalDataQuery()
  
  // Consider loading if either patient or clinical data is loading
  const isLoading = patientLoading || clinicalDataLoading
  const resourceQueryStatus = data?.resourceQueryStatus ?? {}
  const queryIssues = Object.entries(resourceQueryStatus)
    .filter(([, status]) => status && status.state !== 'ok' && status.state !== 'empty')
  const hasBlockingQueryIssues = queryIssues.some(([key]) => BLOCKING_FHIR_QUERY_KEYS.has(key))
  
  return {
    conditions: data?.conditions ?? [],
    medications: data?.medications ?? [],
    allergies: data?.allergies ?? [],
    observations: data?.observations ?? [],
    vitalSigns: data?.vitalSigns ?? [],
    diagnosticReports: data?.diagnosticReports ?? [],
    imagingStudies: data?.imagingStudies ?? [],
    procedures: data?.procedures ?? [],
    encounters: data?.encounters ?? [],
    documentReferences: data?.documentReferences ?? [],
    compositions: data?.compositions ?? [],
    immunizations: data?.immunizations ?? [],
    consents: data?.consents ?? [],
    devices: data?.devices ?? [],
    carePlans: data?.carePlans ?? [],
    resourceQueryStatus,
    queryIssues,
    hasBlockingQueryIssues,
    isLoading,
    error: error as Error | null,
    refetch: async () => {
      await refetch()
    }
  }
}
