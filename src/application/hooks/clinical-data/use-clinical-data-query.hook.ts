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
import { FhirClinicalDataRepository } from '@/src/infrastructure/fhir/repositories/clinical-data.repository'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { usePatientQuery } from '../patient/use-patient-query.hook'

export function useClinicalDataQuery() {
  const { data: patient, isLoading: patientLoading } = usePatientQuery()
  
  return useQuery({
    queryKey: ['clinical-data', patient?.id],
    queryFn: async (): Promise<ClinicalDataCollection> => {
      if (!patient?.id) {
        throw new Error('Patient ID is required')
      }
      
      const repository = new FhirClinicalDataRepository()
      const useCase = new FetchClinicalDataUseCase(repository)
      return await useCase.execute(patient.id)
    },
    enabled: !!patient?.id && !patientLoading, // Only run when patient is loaded
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}

// Backward compatibility hook that matches the old ClinicalDataProvider API
export function useClinicalData() {
  const { data: patient, isLoading: patientLoading } = usePatientQuery()
  const { data, isLoading: clinicalDataLoading, error, refetch } = useClinicalDataQuery()
  
  // Consider loading if either patient or clinical data is loading
  const isLoading = patientLoading || clinicalDataLoading
  
  return {
    conditions: data?.conditions ?? [],
    medications: data?.medications ?? [],
    allergies: data?.allergies ?? [],
    observations: data?.observations ?? [],
    vitalSigns: data?.vitalSigns ?? [],
    diagnosticReports: data?.diagnosticReports ?? [],
    procedures: data?.procedures ?? [],
    encounters: data?.encounters ?? [],
    documentReferences: data?.documentReferences ?? [],
    compositions: data?.compositions ?? [],
    isLoading,
    error: error as Error | null,
    refetch: async () => {
      await refetch()
    }
  }
}
