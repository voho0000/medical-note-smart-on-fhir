'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import {
  useDataSelection,
  type DataConsumer,
} from '@/src/application/providers/data-selection.provider'
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
import { defaultLocale } from '@/src/shared/i18n/i18n.config'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'
import { prioritizeClinicalDataForTokenBudget } from '@/src/core/utils/prioritized-clinical-context.utils'
import type { ClinicalData } from '@/src/application/hooks/clinical-context/types'
import { isDemoDataActive } from '@/src/application/hooks/ai-generation/ai-data-source'
import { clinicalNowMs } from '@/src/shared/constants/demo-data.constants'

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
    // v3 invalidates summaries generated before exact per-row NHI terminology
    // was included in the AI medication context and conflict policy.
    'clinical-ai-source-v3',
    JSON.stringify(patient ?? null),
    JSON.stringify(profile),
    JSON.stringify(clinicalData),
    catalogSignatureText(catalog),
  ].join('\u0000'))
}

interface FitState {
  key: string | object
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
export function useClinicalAiInput(
  requestedContextLimit?: number,
  consumer: DataConsumer = 'insights',
  requestedTargetFraction = 1,
  options: { includeSources?: boolean } = {},
) {
  // Scope controls need the same fitting policy, not a generation-ready source
  // catalog or persistent signature. Preview-only callers expose neither.
  const includeSources = options.includeSources !== false
  const [fitState, setFitState] = useState<FitState>({ key: '', tier: 'full', originalTokens: 0 })
  const { patient } = usePatient()
  const piiLiterals = useMemo(() => buildPatientTextLiterals(patient), [patient])
  const { locale } = useLanguage()
  const clinicalData = useClinicalData() as unknown as ClinicalAiDataInput | null
  const dataSelection = useDataSelection()
  const savedProfile = dataSelection.getProfile(consumer)
  const requestedProfile = useMemo(() => ({
    selection: savedProfile.selection, filters: savedProfile.filters,
    documentMode: savedProfile.documentMode, documentIds: savedProfile.documentIds,
  }), [savedProfile.selection, savedProfile.filters, savedProfile.documentMode, savedProfile.documentIds])
  const patientScope = JSON.stringify(patient ?? null)
  // Commit the user's controls before rebuilding a large chart. Never reuse a
  // deferred selection across a patient/data replacement, or expose a stale
  // input as generation-ready while its replacement is being calculated.
  const requestedInput = useMemo(() => ({
    patientScope, clinicalData, profile: requestedProfile,
    contextLimit: requestedContextLimit, targetFraction: requestedTargetFraction,
  }), [patientScope, clinicalData, requestedProfile, requestedContextLimit, requestedTargetFraction])
  const deferredInput = useDeferredValue(requestedInput)
  const input = deferredInput.patientScope === patientScope && deferredInput.clinicalData === clinicalData
    ? deferredInput : requestedInput
  const inputPending = input !== requestedInput
  const { profile: activeProfile, contextLimit, targetFraction } = input

  const rawDataReady = !!clinicalData
    && !clinicalData.isLoading
    && !clinicalData.isFetching
    && !clinicalData.error
    && !clinicalData.hasBlockingQueryIssues

  // Resolve the saved document selection without building a second formatted
  // context. This keeps the cache/scope identity model-independent while the
  // actual outbound request below may use a smaller transient profile.
  const baseDocumentIds = useMemo(() => {
    if (!rawDataReady || !clinicalData || !activeProfile.selection.documents) return []
    const documents = listClinicalDocuments(
      clinicalData as unknown as Parameters<typeof listClinicalDocuments>[0],
    )
    return resolveSelectedDocuments(
      documents,
      activeProfile.documentMode ?? 'latestAdmission',
      activeProfile.documentIds ?? [],
    ).map((document) => document.id)
  }, [rawDataReady, clinicalData, activeProfile])

  // The demo chart is judged against its own as-of date, not the wall clock —
  // otherwise its medications age out of scope and the pre-generated citations
  // stop resolving. For real data, snapshot "now" for the currently loaded
  // patient instead of calling Date.now() on every render: a millisecond-level
  // dependency invalidated every clinical-data memo whenever unrelated UI
  // state (notably the display language) changed.
  const demoDataActive = isDemoDataActive()
  const clinicalScopeClock = useMemo(
    () => ({
      patient,
      nowMs: clinicalNowMs(demoDataActive),
    }),
    [demoDataActive, patient],
  )
  const scopeNowMs = clinicalScopeClock.nowMs
  const needsBaseScope = includeSources || fitState.tier === 'prioritized'

  const baseScopedClinicalData = useMemo(
    () => (rawDataReady && clinicalData && needsBaseScope
      ? scopeClinicalDataForAi(
          clinicalData as unknown as Partial<ClinicalDataCollection>,
          activeProfile.selection,
          activeProfile.filters,
          baseDocumentIds,
          scopeNowMs,
        ) as ClinicalAiDataInput
      : null),
    [
      rawDataReady,
      clinicalData,
      activeProfile.selection,
      activeProfile.filters,
      baseDocumentIds,
      scopeNowMs,
      needsBaseScope,
    ],
  )

  // The source signature identifies the selected clinical records, not their
  // presentation language. Locale already has its own cache/result slot, so
  // rebuilding and re-hashing the full source catalog on every language toggle
  // only blocks the UI without adding cache isolation. Keep one canonical
  // catalog for this identity; the outbound catalog below remains localized.
  const sourceIdentityCatalog = useMemo(
    () => (includeSources && baseScopedClinicalData
      ? getSourceCatalog(baseScopedClinicalData, defaultLocale)
      : []),
    [includeSources, baseScopedClinicalData],
  )

  const sourceSignature = useMemo(
    () => (includeSources && rawDataReady && baseScopedClinicalData
      ? clinicalAiSourceSignature(
          patient,
          {
            selection: activeProfile.selection,
            filters: activeProfile.filters,
            documentMode: activeProfile.documentMode ?? 'latestAdmission',
            documentIds: activeProfile.documentIds ?? [],
          },
          baseScopedClinicalData,
          sourceIdentityCatalog,
        )
      : ''),
    [
      rawDataReady,
      baseScopedClinicalData,
      patient,
      activeProfile,
      sourceIdentityCatalog,
      includeSources,
    ],
  )

  const targetTokens = useMemo(
    () => {
      if (!contextLimit || contextLimit <= 0) return Number.POSITIVE_INFINITY
      const normalizedFraction = Number.isFinite(targetFraction)
        ? Math.min(1, Math.max(0.01, targetFraction))
        : 1
      return Math.max(
        1,
        Math.floor(clinicalContextTokenTarget(contextLimit) * normalizedFraction),
      )
    },
    [contextLimit, targetFraction],
  )
  // Reference identity is sufficient for transient UI fitting, and avoids
  // serializing/hashing an entire million-token chart merely to open a drawer.
  // All these provider snapshots are immutable and change on patient/scope
  // changes; this key is local to this hook and is never a persisted cache key.
  const previewFitIdentity = useMemo(
    () => ({ patient, clinicalData, activeProfile, scopeNowMs, targetTokens, contextLimit }),
    [patient, clinicalData, activeProfile, scopeNowMs, targetTokens, contextLimit],
  )
  const fitKey = !Number.isFinite(targetTokens) ? ''
    : includeSources
      ? sourceSignature ? `${sourceSignature}:${Math.round(contextLimit ?? 0)}:${targetTokens}` : ''
      : rawDataReady ? previewFitIdentity : ''
  const activeTier: ClinicalContextFitTier =
    fitKey && fitState.key === fitKey ? fitState.tier : 'full'
  const fitCandidate = useMemo(
    () => buildClinicalContextFitCandidate(activeProfile, activeTier, targetTokens),
    [activeProfile, activeTier, targetTokens],
  )
  const prioritizedResult = useMemo(
    () => (
      activeTier === 'prioritized' && baseScopedClinicalData
        ? prioritizeClinicalDataForTokenBudget(
            baseScopedClinicalData as Partial<ClinicalDataCollection>,
            targetTokens,
            fitState.originalTokens,
          )
        : null
    ),
    [activeTier, baseScopedClinicalData, fitState.originalTokens, targetTokens],
  )
  const contextView = useClinicalContext(consumer, {
    profile: fitCandidate.profile,
    clinicalDataOverride: prioritizedResult?.data as ClinicalData | undefined,
    documentTokenBudget:
      prioritizedResult?.documentTokenBudget ?? fitCandidate.documentTokenBudget,
  })
  const { getFormattedClinicalContext, getFullClinicalContext, includedDocumentIds } = contextView

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
  const needsSmallerTier = Boolean(fitKey) &&
    activeTier !== 'prioritized' &&
    candidateTokens > targetTokens

  useEffect(() => {
    if (inputPending || !fitKey || !rawDataReady) return
    // Measure each transient view before advancing. The reduction order is
    // full → 1 year / 8 labs → 6 months / 3 labs → 3 months / latest labs →
    // record-level clinical prioritization. Only the final prioritized view
    // may use bounded text fitting as a last resort.
    // Tier advancement is background work too, so another control change can
    // interrupt it instead of queuing behind every mounted AI consumer.
    startTransition(() => setFitState((current) => {
      if (current.key !== fitKey) {
        if (candidateTokens <= targetTokens) return current
        return {
          key: fitKey,
          tier: nextClinicalContextFitTier('full'),
          originalTokens: candidateTokens,
        }
      }
      if (candidateTokens > targetTokens && current.tier !== 'prioritized') {
        return {
          ...current,
          tier: nextClinicalContextFitTier(current.tier),
        }
      }
      return current
    }))
  }, [activeTier, candidateTokens, fitKey, inputPending, rawDataReady, targetTokens])

  const clinicalContext = useMemo(
    () => (
      activeTier === 'prioritized' &&
      candidateTokens > targetTokens
        ? fitClinicalContextTextToTokenBudget(candidateClinicalContext, targetTokens)
        : candidateClinicalContext
    ),
    [activeTier, candidateClinicalContext, candidateTokens, targetTokens],
  )
  const formattedClinicalContext = useMemo(
    () => (
      activeTier === 'prioritized' &&
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
    // Intermediate tiers cannot be sent or cached. Building their outbound
    // records/catalog only repeats expensive report extraction before the next
    // tier replaces them; the final settled tier still uses the same builder.
    () => (!includeSources || needsSmallerTier ? null : prioritizedResult
      ? prioritizedResult.data as ClinicalAiDataInput
      : rawDataReady && clinicalData
        ? scopeClinicalDataForAi(
          clinicalData as unknown as Partial<ClinicalDataCollection>,
          fitCandidate.profile.selection,
          fitCandidate.profile.filters,
          includedDocumentIds,
          scopeNowMs,
        ) as ClinicalAiDataInput
        : null),
    [
      prioritizedResult,
      rawDataReady,
      clinicalData,
      fitCandidate.profile.selection,
      fitCandidate.profile.filters,
      includedDocumentIds,
      scopeNowMs,
      includeSources,
      needsSmallerTier,
    ],
  )
  const catalog = useMemo(
    () => (scopedClinicalData ? getSourceCatalog(scopedClinicalData, locale) : []),
    [scopedClinicalData, locale],
  )
  const isCalculating = inputPending || needsSmallerTier
  const dataReady = rawDataReady && !isCalculating
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
    clinicalContext: isCalculating ? '' : clinicalContext,
    formattedClinicalContext: isCalculating ? '' : formattedClinicalContext,
    effectiveProfile: fitCandidate.profile,
    inputSignature,
    // Read-only result ownership may survive a model-capacity recalculation.
    // This must NEVER be used as a generation-ready slot/signature.
    sourceScopeSignature: inputPending && activeProfile !== requestedProfile ? '' : sourceSignature,
    clinicalData: isCalculating ? null : scopedClinicalData,
    catalog: isCalculating ? [] : catalog,
    contextAdaptation,
    contextView,
    isCalculating,
  }
}
