'use client'

import { useMemo } from 'react'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  getSourceCatalog,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { contentSignature } from '@/src/infrastructure/cache/encrypted-session-cache'

export type ClinicalAiDataInput = SummaryCatalogInput & {
  isLoading?: boolean
  isFetching?: boolean
  error?: unknown
  hasBlockingQueryIssues?: boolean
}

function catalogSignatureText(catalog: SummarySourceCatalogEntry[]): string {
  return catalog
    .map((entry) => [
      entry.key,
      entry.resourceType,
      entry.resourceId,
      entry.display,
      entry.date ?? '',
      entry.organization ?? '',
      entry.encounterClass ?? '',
    ].join('\u001f'))
    .join('\u001e')
}

/**
 * Fingerprint the exact selected clinical input used by the structured-AI
 * pipelines. The hash is local-only; no clinical text is persisted in the key.
 */
export function clinicalAiInputSignature(
  clinicalContext: string,
  catalog: SummarySourceCatalogEntry[],
): string {
  return contentSignature(`clinical-ai-input-v1\u0000${clinicalContext}\u0000${catalogSignatureText(catalog)}`)
}

/**
 * One readiness/scope snapshot shared by Medical Summary, Safety Alerts and
 * read-only summary consumers. It deliberately exposes no usable slot until
 * patient + clinical queries have both settled.
 */
export function useClinicalAiInput() {
  const { patient } = usePatient()
  const { getFullClinicalContext, includedDocumentIds } = useClinicalContext('insights')
  const clinicalData = useClinicalData() as unknown as ClinicalAiDataInput | null
  const dataSelection = useDataSelection()
  const insightsProfile = dataSelection.getProfile('insights')

  const dataReady = !!clinicalData
    && !clinicalData.isLoading
    && !clinicalData.isFetching
    && !clinicalData.error
    && !clinicalData.hasBlockingQueryIssues

  const scopedClinicalData = useMemo(
    () => (dataReady && clinicalData
      ? scopeClinicalDataForAi(
          clinicalData as unknown as Partial<ClinicalDataCollection>,
          insightsProfile.selection,
          insightsProfile.filters,
          includedDocumentIds,
        ) as ClinicalAiDataInput
      : null),
    [dataReady, clinicalData, insightsProfile.selection, insightsProfile.filters, includedDocumentIds],
  )

  const catalog = useMemo(
    () => (scopedClinicalData ? getSourceCatalog(scopedClinicalData) : []),
    [scopedClinicalData],
  )

  // Capture the outbound context once. The slot signature and the eventual
  // model request must describe the same render, even if a refetch starts
  // immediately after the user clicks Generate.
  const clinicalContext = useMemo(
    () => (dataReady ? getFullClinicalContext() : ''),
    [dataReady, getFullClinicalContext],
  )
  const inputSignature = useMemo(
    () => (dataReady ? clinicalAiInputSignature(clinicalContext, catalog) : ''),
    [dataReady, clinicalContext, catalog],
  )

  return {
    patientId: patient?.id ?? '',
    dataReady,
    clinicalContext,
    inputSignature,
    clinicalData: scopedClinicalData,
    catalog,
  }
}
