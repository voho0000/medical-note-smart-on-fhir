/**
 * Application Hook: Local FHIR Tools
 *
 * Provides FHIR query tools that read from the in-memory parsed local bundle
 * (LocalBundleService), used when the user uploaded a FHIR JSON instead of
 * launching via SMART. Same tool names + schemas as `useFhirTools` so the
 * LLM-facing surface stays identical.
 */

import { useMemo } from 'react'
import { createLocalFhirTools } from '@/src/infrastructure/ai/tools/local-fhir-tools'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'

export function useLocalFhirTools() {
  return useMemo(() => {
    if (!shouldUseLocalBundle()) return null
    // Lazy getter — re-reads localStorage on each tool call so re-uploads
    // during the same tab don't serve stale data.
    return createLocalFhirTools(() => LocalBundleService.parseStored())
  }, [])
}
