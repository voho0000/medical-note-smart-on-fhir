import { useState, useEffect, useMemo } from 'react'
import { fhirClient, LocalBundleModeError } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
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

    // Bundle-import mode: there is no remote FHIR server, so just clear the
    // server-URL state and skip the SMART client init entirely.
    if (LocalBundleService.hasData()) {
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
