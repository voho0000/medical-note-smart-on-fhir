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
import { shouldUseLocalBundle, hasSmartContext, LocalBundleModeError } from '@/src/infrastructure/fhir/client/fhir-client.service'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import {
  CLINICAL_SESSION_GC_TIME,
  CLINICAL_SESSION_STALE_TIME,
} from '../clinical-data/clinical-session-cache'

export function usePatientQuery() {
  return useQuery({
    queryKey: ['patient'],
    queryFn: async (): Promise<PatientEntity | null> => {
      // SMART > local bundle: an active SMART/OAuth launch always wins over
      // any leftover imported bundle. Only fall back to the bundle when
      // there's no SMART context present.
      if (shouldUseLocalBundle()) {
        return (await LocalBundleService.parseStored())?.patient ?? null
      }
      // No data source at all — return null silently. The UI uses this
      // (combined with no error) to render the welcome / onboarding screen
      // instead of "Failed to initialize FHIR client" noise.
      if (!hasSmartContext()) {
        return null
      }
      try {
        const repository = new FhirPatientRepository()
        const useCase = new GetPatientUseCase(repository)
        return await useCase.execute()
      } catch (error) {
        // Race / stale state: hasSmartContext said yes but getClient bailed
        // (e.g. session expired between checks). Fall back to onboarding
        // instead of surfacing this as a query error.
        if (error instanceof LocalBundleModeError) return null
        throw error
      }
    },
    // The active local Bundle is an immutable tab-session snapshot. Import and
    // clear explicitly invalidate this query; elapsed time alone must not make
    // an idle tab reload the same patient.
    staleTime: CLINICAL_SESSION_STALE_TIME,
    gcTime: CLINICAL_SESSION_GC_TIME,
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
