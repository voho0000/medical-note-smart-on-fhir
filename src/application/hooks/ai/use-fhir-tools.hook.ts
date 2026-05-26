/**
 * Application Hook: FHIR Tools
 *
 * Provides FHIR query tools for the AI agent. The tools read from the same
 * in-memory ClinicalDataCollection that the left-panel UI consumes (React
 * Query in SMART mode, LocalBundleService in local-bundle mode), so:
 *   1. Single implementation backs both modes (no live/local duplication).
 *   2. Agent sees exactly what the clinician sees on screen.
 *   3. Live mode tool calls hit the 5-min React Query cache instead of
 *      round-tripping the SMART server on every invocation.
 */

import { useCallback, useMemo } from 'react'
import { createFhirTools, type AgentDataSource } from '@/src/infrastructure/ai/tools/fhir-tools'
import { usePatientQuery } from '../patient/use-patient-query.hook'
import { useClinicalDataQuery } from '../clinical-data/use-clinical-data-query.hook'

export function useFhirTools() {
  const { data: patient } = usePatientQuery()
  const { data: collection } = useClinicalDataQuery()

  const getData = useCallback(
    (): AgentDataSource => ({ patient: patient ?? null, collection: collection ?? null }),
    [patient, collection]
  )

  return useMemo(() => createFhirTools(getData), [getData])
}
