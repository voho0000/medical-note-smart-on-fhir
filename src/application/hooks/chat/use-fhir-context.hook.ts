import { useState, useEffect, useMemo } from 'react'
import { fhirClient } from '@/src/infrastructure/fhir/client/fhir-client.service'
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

    const loadServerUrl = async () => {
      try {
        const client = await fhirClient.getClient()
        const serverUrl = client.state?.serverUrl || null
        
        if (mounted) {
          setFhirServerUrl(serverUrl)
          setIsLoadingServer(false)
        }
      } catch (error) {
        console.error('[FHIR Context] Failed to load server URL:', error)
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
