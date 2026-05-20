import { useState, useEffect, useMemo } from 'react'
import { fhirClient, LocalBundleModeError, shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'

interface FhirContext {
  patientId: string | null
  patientName: string | null
  fhirServerUrl: string | null
  isLoading: boolean
}

export function useFhirContext(): FhirContext {
  const { patient, loading: patientLoading } = usePatient()
  const [fhirServerUrl, setFhirServerUrl] = useState<string | null>(null)
  const [isLoadingServer, setIsLoadingServer] = useState(true)

  useEffect(() => {
    let mounted = true

    // Local-bundle mode (and not in a SMART launch): no remote FHIR server,
    // so just clear the server-URL state and skip SMART client init.
    if (shouldUseLocalBundle()) {
      setFhirServerUrl(null)
      setIsLoadingServer(false)
      return () => { mounted = false }
    }

    const loadServerUrl = async () => {
      try {
        const client = await fhirClient.getClient()
        const serverUrl = client.state?.serverUrl || null

        if (mounted) {
          setFhirServerUrl(serverUrl)
          setIsLoadingServer(false)
        }
      } catch (error) {
        // Bundle mode races (bundle appeared after the hasData() check) —
        // silently treat as no-server. Real errors still surface.
        if (!(error instanceof LocalBundleModeError)) {
          console.error('[FHIR Context] Failed to load server URL:', error)
        }
        if (mounted) {
          setFhirServerUrl(null)
          setIsLoadingServer(false)
        }
      }
    }

    loadServerUrl()

    return () => {
      mounted = false
    }
  }, [])

  return useMemo(() => {
    const patientId = patient?.id || null
    const patientName = patient ? getPatientDisplayName(patient) : null
    
    return {
      patientId,
      patientName,
      fhirServerUrl,
      isLoading: patientLoading || isLoadingServer,
    }
  }, [patient, fhirServerUrl, patientLoading, isLoadingServer])
}
