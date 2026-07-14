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
import { useMemo } from 'react'
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
          const unavailable = (resourceType: string) => ({
            resourceType,
            state: 'error' as const,
            message: 'Clinical data source became unavailable before the query completed.',
          })
          return {
            conditions: [], medications: [], allergies: [], observations: [],
            vitalSigns: [], diagnosticReports: [], imagingStudies: [], procedures: [], encounters: [],
            documentReferences: [], compositions: [], immunizations: [],
            consents: [], devices: [], carePlans: [],
            resourceQueryStatus: {
              Condition: unavailable('Condition'),
              MedicationRequest: unavailable('MedicationRequest'),
              AllergyIntolerance: unavailable('AllergyIntolerance'),
              Observation: unavailable('Observation'),
              'Observation:vital-signs': unavailable('Observation'),
              DiagnosticReport: unavailable('DiagnosticReport'),
              ImagingStudy: unavailable('ImagingStudy'),
              Procedure: unavailable('Procedure'),
              Encounter: unavailable('Encounter'),
              DocumentReference: unavailable('DocumentReference'),
              Composition: unavailable('Composition'),
              Immunization: unavailable('Immunization'),
              Consent: unavailable('Consent'),
              Device: unavailable('Device'),
              CarePlan: unavailable('CarePlan'),
            },
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
  const {
    isLoading: patientLoading,
    isFetching: patientFetching,
  } = usePatientQuery()
  const {
    data,
    isLoading: clinicalDataLoading,
    isFetching: clinicalDataFetching,
    error,
    refetch,
  } = useClinicalDataQuery()
  
  // Keep one referentially-stable snapshot until React Query actually changes
  // data or request state. AI/context consumers use this object as a memo key;
  // returning a fresh literal on every parent render invalidated every clinical
  // section and rebuilt the full lab catalog during unrelated tab switches.
  return useMemo(() => {
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
      // React Query keeps isLoading=false while it refreshes cached data in the
      // background. AI consumers must also wait for that refresh: otherwise a
      // patient card can remain available from cache while the matching visits,
      // reports and medications are still being replaced underneath it.
      isFetching: patientFetching || clinicalDataFetching,
      error: error as Error | null,
      refetch: async () => {
        await refetch()
      },
    }
  }, [
    clinicalDataFetching,
    clinicalDataLoading,
    data,
    error,
    patientFetching,
    patientLoading,
    refetch,
  ])
}
