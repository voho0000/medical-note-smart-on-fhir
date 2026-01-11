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
import { fhirClient } from '@/src/infrastructure/fhir/client/fhir-client.service'

export function useFhirTools(patientId: string | undefined) {
  const [tools, setTools] = useState<ReturnType<typeof createFhirTools> | null>(null)

  useEffect(() => {
    if (!patientId) {
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
        console.error('Failed to initialize FHIR tools:', error)
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
