/**
 * Application Hook: FHIR Tools
 * 
 * Facade hook that provides FHIR tools for AI agent interactions.
 * Isolates features from infrastructure layer details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing infrastructure
 */

import { useState, useEffect } from 'react'
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import { fhirClient, LocalBundleModeError } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

export function useFhirTools(patientId: string | undefined) {
  const [tools, setTools] = useState<ReturnType<typeof createFhirTools> | null>(null)

  useEffect(() => {
    if (!patientId) {
      setTools(null)
      return
    }

    // Bundle-import mode: AI FHIR tools require a live SMART client, which
    // doesn't exist when reading from a locally-imported bundle. Skip init
    // (the AI agent will simply not have FHIR query tools in this mode).
    if (LocalBundleService.hasData()) {
      setTools(null)
      return
    }

    let mounted = true

    const initTools = async () => {
      try {
        const client = await fhirClient.getClient()
        if (mounted) {
          setTools(createFhirTools(client, patientId))
        }
      } catch (error) {
        if (!(error instanceof LocalBundleModeError)) {
          console.error('Failed to initialize FHIR tools:', error)
        }
        if (mounted) {
          setTools(null)
        }
      }
    }

    initTools()

    return () => {
      mounted = false
    }
  }, [patientId])

  return tools
}
