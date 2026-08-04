'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  buildClinicalContextFitCandidate,
  clinicalContextTokenTarget,
  fitClinicalContextTextToTokenBudget,
  nextClinicalContextFitTier,
  type ClinicalContextAdaptation,
  type ClinicalContextFitTier,
} from '@/src/core/utils/adaptive-clinical-context.utils'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'
import {
  getSourceCatalog,
  type SummaryCatalogInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { contentSignature } from '@/src/infrastructure/cache/encrypted-session-cache'
import { useLanguage } from '@/src/application/providers/language.provider'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'

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
 * Model-independent identity for one saved clinical-data selection. The
 * formatted request can be adapted differently for a 32k and a 128k model,
 * but both still belong to the same patient/input scope for orchestration and
 * read-only cache lookup.
 */
export function clinicalAiSourceSignature(
  patient: unknown,
  profile: unknown,
  clinicalData: ClinicalAiDataInput,
  catalog: SummarySourceCatalogEntry[],
): string {
  return contentSignature([
    'clinical-ai-source-v2',
    JSON.stringify(patient ?? null),
    JSON.stringify(profile),
    JSON.stringify(clinicalData),
    catalogSignatureText(catalog),
  ].join('\u0000'))
}

interface FitState {
  key: string
  tier: ClinicalContextFitTier
  originalTokens: number
}

/**
 * One readiness/scope snapshot shared by Medical Summary, Safety Alerts and
 * read-only summary consumers. It deliberately exposes no usable slot until
 * patient + clinical queries have both settled. When a model limit is
 * supplied, the outbound view is progressively reduced without mutating the
 * user's saved Data Selection profile.
 */
export function useClinicalAiInput(contextLimit?: number) {
  const { patient } = usePatient()
  const piiLiterals = useMemo(() => buildPatientTextLiterals(patient), [patient])
  const { locale } = useLanguage()
  const clinicalData = useClinicalData() as unknown as ClinicalAiDataInput | null
  const dataSelection = useDataSelection()
  const insightsProfile = dataSelection.getProfile('insights')

  const rawDataReady = !!clinicalData
    && !clinicalData.isLoading
    && !clinicalData.isFetching
    && !clinicalData.error
    && !clinicalData.hasBlockingQueryIssues

  // Resolve the saved document selection without building a second formatted
  // context. This keeps the cache/scope identity model-independent while the
  // actual outbound request below may use a smaller transient profile.
  const baseDocumentIds = useMemo(() => {
    if (!rawDataReady || !clinicalData || !insightsProfile.selection.documents) return []
    const documents = listClinicalDocuments(
      clinicalData as unknown as Parameters<typeof listClinicalDocuments>[0],
    )
    return resolveSelectedDocuments(
      documents,
      insightsProfile.documentMode ?? 'latestAdmission',
      insightsProfile.documentIds ?? [],
    ).map((document) => document.id)
  }, [rawDataReady, clinicalData, insightsProfile])

  const baseScopedClinicalData = useMemo(
    () => (rawDataReady && clinicalData
      ? scopeClinicalDataForAi(
          clinicalData as unknown as Partial<ClinicalDataCollection>,
          insightsProfile.selection,
          insightsProfile.filters,
          baseDocumentIds,
        ) as ClinicalAiDataInput
      : null),
    [
      rawDataReady,
      clinicalData,
      insightsProfile.selection,
      insightsProfile.filters,
      baseDocumentIds,
    ],
  )

  const baseCatalog = useMemo(
    () => (baseScopedClinicalData ? getSourceCatalog(baseScopedClinicalData, locale) : []),
    [baseScopedClinicalData, locale],
  )

  const sourceSignature = useMemo(
    () => (rawDataReady && baseScopedClinicalData
      ? clinicalAiSourceSignature(
          patient,
          {
            selection: insightsProfile.selection,
            filters: insightsProfile.filters,
            documentMode: insightsProfile.documentMode ?? 'latestAdmission',
            documentIds: insightsProfile.documentIds ?? [],
          },
          baseScopedClinicalData,
          baseCatalog,
        )
      : ''),
    [
      rawDataReady,
      baseScopedClinicalData,
      patient,
      insightsProfile,
      baseCatalog,
    ],
  )

  const targetTokens = useMemo(
    () => (contextLimit && contextLimit > 0
      ? clinicalContextTokenTarget(contextLimit)
      : Number.POSITIVE_INFINITY),
    [contextLimit],
  )
  const fitKey = sourceSignature && Number.isFinite(targetTokens)
    ? `${sourceSignature}:${Math.round(contextLimit ?? 0)}`
    : ''
  const [fitState, setFitState] = useState<FitState>({
    key: '',
    tier: 'full',
    originalTokens: 0,
  })
  const activeTier: ClinicalContextFitTier =
    fitKey && fitState.key === fitKey ? fitState.tier : 'full'
  const fitCandidate = useMemo(
    () => buildClinicalContextFitCandidate(insightsProfile, activeTier, targetTokens),
    [insightsProfile, activeTier, targetTokens],
  )
  const {
    getFormattedClinicalContext,
    getFullClinicalContext,
    includedDocumentIds,
  } = useClinicalContext('insights', {
    profile: fitCandidate.profile,
    documentTokenBudget: fitCandidate.documentTokenBudget,
  })

  const candidateClinicalContext = useMemo(
    () => (rawDataReady ? getFullClinicalContext() : ''),
    [rawDataReady, getFullClinicalContext],
  )
  const candidateFormattedClinicalContext = useMemo(
    () => (rawDataReady ? getFormattedClinicalContext() : ''),
    [rawDataReady, getFormattedClinicalContext],
  )
  const candidateTokens = useMemo(
    () => estimateTokens(candidateClinicalContext),
    [candidateClinicalContext],
  )
  const needsSmallerTier =
    Boolean(fitKey) &&
    candidateTokens > targetTokens &&
    activeTier !== 'tight'

  useEffect(() => {
    if (!fitKey || !rawDataReady) return
    // The state machine evaluates only one profile per render: full → compact
    // → tight. This avoids constructing every possible context up front.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFitState((current) => {
      if (current.key !== fitKey) {
        if (candidateTokens <= targetTokens) return current
        return {
          key: fitKey,
          tier: 'compact',
          originalTokens: candidateTokens,
        }
      }
      if (candidateTokens <= targetTokens || current.tier === 'tight') return current
      return {
        ...current,
        tier: nextClinicalContextFitTier(current.tier),
      }
    })
  }, [candidateTokens, fitKey, rawDataReady, targetTokens])

  const clinicalContext = useMemo(
    () => (
      activeTier === 'tight' && candidateTokens > targetTokens
        ? fitClinicalContextTextToTokenBudget(candidateClinicalContext, targetTokens)
        : candidateClinicalContext
    ),
    [activeTier, candidateClinicalContext, candidateTokens, targetTokens],
  )
  const formattedClinicalContext = useMemo(
    () => (
      activeTier === 'tight' &&
      estimateTokens(candidateFormattedClinicalContext) > targetTokens
        ? fitClinicalContextTextToTokenBudget(
            candidateFormattedClinicalContext,
            targetTokens,
          )
        : candidateFormattedClinicalContext
    ),
    [activeTier, candidateFormattedClinicalContext, targetTokens],
  )

  const scopedClinicalData = useMemo(
    () => (rawDataReady && clinicalData
      ? scopeClinicalDataForAi(
          clinicalData as unknown as Partial<ClinicalDataCollection>,
          fitCandidate.profile.selection,
          fitCandidate.profile.filters,
          includedDocumentIds,
        ) as ClinicalAiDataInput
      : null),
    [
      rawDataReady,
      clinicalData,
      fitCandidate.profile.selection,
      fitCandidate.profile.filters,
      includedDocumentIds,
    ],
  )
  const catalog = useMemo(
    () => (scopedClinicalData ? getSourceCatalog(scopedClinicalData, locale) : []),
    [scopedClinicalData, locale],
  )
  const dataReady = rawDataReady && !needsSmallerTier
  // Do not hydrate or expose a generation slot for an intermediate fitting
  // tier. The signature itself is model-independent once the adapted context
  // has settled.
  const inputSignature = dataReady ? sourceSignature : ''
  const adaptedTokens = useMemo(() => estimateTokens(clinicalContext), [clinicalContext])
  const contextAdaptation: ClinicalContextAdaptation | null =
    activeTier === 'full' || !contextLimit
      ? null
      : {
          tier: activeTier,
          contextLimit,
          targetTokens,
          originalTokens: fitState.key === fitKey
            ? fitState.originalTokens
            : candidateTokens,
          adaptedTokens,
        }

  return {
    patientId: patient?.id ?? '',
    piiLiterals,
    dataReady,
    clinicalContext,
    formattedClinicalContext,
    effectiveProfile: fitCandidate.profile,
    inputSignature,
    clinicalData: scopedClinicalData,
    catalog,
    contextAdaptation,
  }
}
