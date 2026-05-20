/**
 * Patient Query Hook (React Query)
 * 
 * Replaces PatientProvider with React Query for better server state management.
 * 
 * Benefits:
 * - Automatic caching and background refetching
 * - No unnecessary re-renders
 * - Built-in loading and error states
 * - Optimistic updates support
 */

import { useQuery } from '@tanstack/react-query'
import { GetPatientUseCase } from '@/src/core/use-cases/patient/get-patient.use-case'
import { FhirPatientRepository } from '@/src/infrastructure/fhir/repositories/patient.repository'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

export function usePatientQuery() {
  return useQuery({
    queryKey: ['patient'],
    queryFn: async (): Promise<PatientEntity | null> => {
      // SMART > local bundle: an active SMART/OAuth launch always wins over
      // any leftover imported bundle. Only fall back to the bundle when
      // there's no SMART context present.
      if (shouldUseLocalBundle()) {
        return LocalBundleService.parseStored()?.patient ?? null
      }
      const repository = new FhirPatientRepository()
      const useCase = new GetPatientUseCase(repository)
      return await useCase.execute()
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

// Backward compatibility hook that matches the old PatientProvider API
export function usePatient() {
  const { data: patient, isLoading: loading, error, refetch } = usePatientQuery()
  
  return {
    patient: patient ?? null,
    loading,
    error: error ? (error as Error).message : null,
    refetch: async () => {
      await refetch()
    }
  }
}
