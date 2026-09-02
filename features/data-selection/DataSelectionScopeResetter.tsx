'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useAiDataSource } from '@/src/application/hooks/ai-generation/ai-data-source'
import {
  useDataSelection,
  type DataConsumer,
} from '@/src/application/providers/data-selection.provider'

const DATA_CONSUMERS: DataConsumer[] = ['chat', 'insights', 'ips', 'aiExport']

/**
 * Clears patient-specific FHIR document picks whenever the authenticated user,
 * patient, or local import changes. Reusable category and filter preferences
 * remain intact.
 */
export function DataSelectionScopeResetter() {
  const { user, loading: authLoading } = useAuth()
  const { patient } = usePatient()
  const dataSource = useAiDataSource()
  const {
    getProfile,
    setDocumentModeFor,
    setDocumentIdsFor,
  } = useDataSelection()
  const loadedScopeRef = useRef<string | undefined>(undefined)

  const clinicalScope = useMemo(() => {
    if (authLoading) return null
    return [
      user?.uid ?? 'guest',
      dataSource.importId ?? `${dataSource.source}:${patient?.id ?? 'none'}`,
    ].join('|')
  }, [authLoading, dataSource.importId, dataSource.source, patient?.id, user?.uid])

  useEffect(() => {
    if (!clinicalScope) return
    if (loadedScopeRef.current === undefined) {
      loadedScopeRef.current = clinicalScope
      return
    }
    if (loadedScopeRef.current === clinicalScope) return
    loadedScopeRef.current = clinicalScope

    DATA_CONSUMERS.forEach((consumer) => {
      const profile = getProfile(consumer)
      if (profile.documentIds.length > 0) setDocumentIdsFor(consumer, [])
      if (profile.documentMode === 'custom') {
        setDocumentModeFor(consumer, 'deduplicatedAdmissions')
      }
    })
  }, [clinicalScope, getProfile, setDocumentIdsFor, setDocumentModeFor])

  return null
}
