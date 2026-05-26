import { useState, useEffect, useMemo } from 'react'
import { fhirClient, LocalBundleModeError, shouldUseLocalBundle, hasSmartContext } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'

/**
 * Sentinel identifier used in place of a real FHIR server URL when the user
 * is in local-bundle mode. Chat sessions are keyed by `(userId, patientId,
 * fhirServerUrl)` — without a stable string, the read-side React Query is
 * disabled (it requires truthy `fhirServerUrl`) and local-mode chat history
 * is invisible even though auto-save writes it under a fallback key.
 *
 * UI components (e.g. ConnectionInfo) should detect this sentinel and show
 * a friendly label instead of leaking the raw string.
 */
export const LOCAL_BUNDLE_FHIR_URL = 'local-bundle'

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

    const resolve = async () => {
      // Local-bundle mode (and not in a SMART launch): no remote FHIR server,
      // but chat history needs a stable scoping key — use the sentinel so
      // save + load both target the same partition in Firestore.
      if (shouldUseLocalBundle()) {
        if (mounted) {
          setFhirServerUrl(LOCAL_BUNDLE_FHIR_URL)
          setIsLoadingServer(false)
        }
        return
      }

      // No data source at all (first visit / cleared bundle). Skip SMART
      // client init so we don't spam the console with "Failed to initialize"
      // — the UI will render the onboarding screen instead.
      if (!hasSmartContext()) {
        if (mounted) {
          setFhirServerUrl(null)
          setIsLoadingServer(false)
        }
        return
      }

      try {
        const client = await fhirClient.getClient()
        const serverUrl = client.state?.serverUrl || null
        if (mounted) {
          setFhirServerUrl(serverUrl)
          setIsLoadingServer(false)
        }
      } catch (error) {
        if (!(error instanceof LocalBundleModeError)) {
          console.error('[FHIR Context] Failed to load server URL:', error)
        }
        if (mounted) {
          setFhirServerUrl(null)
          setIsLoadingServer(false)
        }
      }
    }

    resolve()

    // Re-resolve whenever the bundle is imported / cleared so the URL state
    // stays in sync with the actual data source (otherwise local-bundle
    // sentinel sticks around after the user clears, and the chat-history
    // drawer keeps querying Firestore under that stale key).
    const handleBundleChange = () => {
      // Wipe any cached SMART client so a transition from local→none doesn't
      // serve stale state. Safe no-op when client was never set.
      fhirClient.clearClient()
      resolve()
    }
    window.addEventListener('mediprisma:local-bundle-changed', handleBundleChange)

    return () => {
      mounted = false
      window.removeEventListener('mediprisma:local-bundle-changed', handleBundleChange)
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
