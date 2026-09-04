'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import {
  documentTextPolicyIdentity,
  resolveDocumentTextMode,
} from '@/src/core/utils/document-text-policy.utils'
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
  hasManualDocumentSelection,
  nextClinicalContextFitTier,
  nextPrioritizedContextBudget,
  selectBestClinicalContextFitTier,
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
import { PROTECTED_DOCUMENT_HINT_LIMIT } from '@/src/shared/utils/context-budget'
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
    // Context FORMAT version. Bump whenever the rendered clinical context
    // changes shape, even when the selected records are identical: this
    // signature is model-independent and record-derived, so without a bump a
    // summary written against the previous format would be reused verbatim.
    // v3 — exact per-row NHI terminology in the medication context.
    // v4 — per-analyte lab series (replacing the date × test pivot + key-trend
    //      appendix) and impression-first imaging reports.
    // v5 — safety-first section order (demographics → temporal → allergies →
    //      problems → medications → procedures/admissions → labs → imaging →
    //      documents) plus the claims-derived problem timeline.
    'clinical-ai-source-v5',
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
  /** Measured tokens of every rung visited so far, for best-fit selection. */
  measuredTokens: Partial<Record<ClinicalContextFitTier, number>>
  /** Budget handed to the record prioritizer. Undefined uses the plain target;
   *  convergence lowers it when the rendered prioritized rung overshoots. */
  prioritizedBudget?: number
  /** Prioritizer re-runs performed for this key (0 before the first rebuild). */
  prioritizedPasses: number
  /** True while rungs are still being measured; false once one was chosen. */
  probing: boolean
}

const INITIAL_FIT_STATE: FitState = {
  key: '',
  tier: 'full',
  originalTokens: 0,
  measuredTokens: {},
  prioritizedPasses: 0,
  probing: false,
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
  requestedAllowTextTruncation = true,
  requestedMaxClinicalTokens?: number,
  options: { includeSources?: boolean } = {},
) {
  // Scope controls need the same fitting policy, not a generation-ready source
  // catalog or persistent signature. Preview-only callers expose neither.
  const includeSources = options.includeSources !== false
  const [fitState, setFitState] = useState<FitState>(INITIAL_FIT_STATE)
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
    allowTextTruncation: requestedAllowTextTruncation, maxClinicalTokens: requestedMaxClinicalTokens,
  }), [patientScope, clinicalData, requestedProfile, requestedContextLimit, requestedTargetFraction, requestedAllowTextTruncation, requestedMaxClinicalTokens])
  const deferredInput = useDeferredValue(requestedInput)
  const input = deferredInput.patientScope === patientScope && deferredInput.clinicalData === clinicalData
    ? deferredInput : requestedInput
  const inputPending = input !== requestedInput
  const { profile: activeProfile, contextLimit, targetFraction, maxClinicalTokens } = input
  const preserveManualDocuments = hasManualDocumentSelection(activeProfile)
  const allowTextTruncation = input.allowTextTruncation && !preserveManualDocuments
  // One policy decision, shared by the rendered context below and by the cache
  // identity: the handoff consumer and every manual selection carry complete
  // documents; automatic modes carry key sections only.
  const documentTextMode = resolveDocumentTextMode(consumer, activeProfile.documentMode)

  const rawDataReady = !!clinicalData
    && !clinicalData.isLoading
    && !clinicalData.isFetching
    && !clinicalData.error
    && !clinicalData.hasBlockingQueryIssues

  // Resolve the saved document selection without building a second formatted
  // context. This keeps the cache/scope identity model-independent while the
  // actual outbound request below may use a smaller transient profile.
  const baseDocuments = useMemo(() => {
    if (!rawDataReady || !clinicalData || !activeProfile.selection.documents) return []
    const documents = listClinicalDocuments(
      clinicalData as unknown as Parameters<typeof listClinicalDocuments>[0],
    )
    return resolveSelectedDocuments(
      documents,
      activeProfile.documentMode ?? 'deduplicatedAdmissions',
      activeProfile.documentIds ?? [],
    )
  }, [rawDataReady, clinicalData, activeProfile])
  const baseDocumentIds = useMemo(
    () => baseDocuments.map((document) => document.id),
    [baseDocuments],
  )
  // Which manual picks weigh the most. An overflow message that only reports a
  // count leaves the user guessing which document to untick.
  const protectedDocuments = useMemo(
    () => (preserveManualDocuments
      ? baseDocuments
          .map((document) => ({
            id: document.id,
            title: document.title,
            tokens: estimateTokens(document.text ?? ''),
          }))
          .sort((a, b) => b.tokens - a.tokens)
          .slice(0, PROTECTED_DOCUMENT_HINT_LIMIT)
      : []),
    [baseDocuments, preserveManualDocuments],
  )

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
            documentMode: activeProfile.documentMode ?? 'deduplicatedAdmissions',
            documentIds: activeProfile.documentIds ?? [],
            // Earlier custom scopes could silently omit selected documents.
            // Do not hydrate those cached outputs under the new policy.
            // Automatic document modes send only the clinically dense sections
            // of a recognised discharge summary; a manual pick and the AI
            // handoff send whole documents. Those are different inputs and
            // must never be hydrated into each other.
            ...(preserveManualDocuments
              ? { manualDocumentPolicy: 'complete-v1' }
              : documentTextPolicyIdentity(documentTextMode)),
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
      preserveManualDocuments,
      documentTextMode,
    ],
  )

  const targetTokens = useMemo(
    () => {
      // An absent/zero model window still has to respect an explicit clinical
      // cap (VGHBrain's 100K): otherwise the caller silently gets an unbounded
      // target and the tier ladder never advances.
      if (!contextLimit || contextLimit <= 0) {
        return maxClinicalTokens && maxClinicalTokens > 0
          ? Math.max(1, maxClinicalTokens)
          : Number.POSITIVE_INFINITY
      }
      const normalizedFraction = Number.isFinite(targetFraction)
        ? Math.min(1, Math.max(0.01, targetFraction))
        : 1
      return Math.max(
        1,
        Math.min(
          Math.floor(clinicalContextTokenTarget(contextLimit) * normalizedFraction),
          maxClinicalTokens ?? Number.POSITIVE_INFINITY,
        ),
      )
    },
    [contextLimit, targetFraction, maxClinicalTokens],
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
  // The prioritizer's own budget, which convergence below may pull under the
  // target once its rendered result has been measured.
  const prioritizedBudget = fitKey && fitState.key === fitKey
    ? fitState.prioritizedBudget ?? targetTokens
    : targetTokens
  const fitCandidate = useMemo(
    () => buildClinicalContextFitCandidate(activeProfile, activeTier, targetTokens),
    [activeProfile, activeTier, targetTokens],
  )
  const prioritizedResult = useMemo(
    () => (
      activeTier === 'prioritized' && baseScopedClinicalData
        ? prioritizeClinicalDataForTokenBudget(
            baseScopedClinicalData as Partial<ClinicalDataCollection>,
            prioritizedBudget,
            fitState.originalTokens,
            scopeNowMs,
            { preserveDocuments: preserveManualDocuments },
          )
        : null
    ),
    [activeTier, baseScopedClinicalData, fitState.originalTokens, prioritizedBudget, scopeNowMs, preserveManualDocuments],
  )
  const contextView = useClinicalContext(consumer, {
    profile: fitCandidate.profile,
    clinicalDataOverride: prioritizedResult?.data as ClinicalData | undefined,
    // VGHBrain selects whole records/documents only. An oversized retained
    // document must reach preflight intact rather than lose its middle.
    documentTokenBudget: allowTextTruncation
      ? prioritizedResult?.documentTokenBudget ?? fitCandidate.documentTokenBudget
      : undefined,
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
  // An intermediate measurement is never sent or cached, so the expensive
  // outbound artifacts below stay unbuilt until a rung has been chosen.
  const isFitting = Boolean(fitKey) && (
    fitState.key === fitKey ? fitState.probing : candidateTokens > targetTokens
  )

  useEffect(() => {
    if (inputPending || !fitKey || !rawDataReady) return
    // Measure each transient view before advancing. The reduction order is
    // full → 1 year / 8 labs → 6 months / 3 labs → 3 months / latest labs →
    // record-level clinical prioritization. A full context that already fits
    // short-circuits immediately; otherwise every rung is measured and the
    // largest one that still fits the target is used, because the ladder is
    // not monotone (the record-level tier keeps far more evidence than the
    // date-window tiers that precede it). Only the final prioritized view may
    // use bounded text fitting as a last resort.
    // Tier advancement is background work too, so another control change can
    // interrupt it instead of queuing behind every mounted AI consumer.
    startTransition(() => setFitState((current) => {
      if (current.key !== fitKey) {
        if (candidateTokens <= targetTokens) return current
        return {
          key: fitKey,
          tier: nextClinicalContextFitTier('full'),
          originalTokens: candidateTokens,
          measuredTokens: { full: candidateTokens },
          prioritizedPasses: 0,
          probing: true,
        }
      }
      if (!current.probing) return current
      const measuredTokens = { ...current.measuredTokens, [current.tier]: candidateTokens }
      if (current.tier === 'prioritized') {
        // Make this rung fit by construction. The prioritizer selects whole
        // records against a budget derived from a dataset-wide estimate ratio,
        // so its RENDERED size can land just past the target — and best-fit
        // then rejected the only rung able to fill the window, falling back to
        // `trimmed` at a fraction of the capacity. Re-aim it at a budget scaled
        // by the observed overshoot and rebuild; the first candidate that fits
        // is kept. Bounded passes, and only reached when prioritized overshoots
        // (a fitting `full` context short-circuits long before this).
        const nextBudget = nextPrioritizedContextBudget(
          current.prioritizedBudget ?? targetTokens,
          candidateTokens,
          targetTokens,
          current.prioritizedPasses,
          current.measuredTokens.prioritized,
        )
        if (nextBudget !== null) {
          return {
            ...current,
            measuredTokens,
            prioritizedBudget: nextBudget,
            prioritizedPasses: current.prioritizedPasses + 1,
          }
        }
      }
      // The date-window rungs are nested by construction (trimmed ⊇ compact ⊇
      // tight), so once one of them fits, no narrower one can carry more and
      // measuring them would only cost another pass over a large chart. Only
      // the record-level tier is not comparable, so it is always measured.
      const nextTier = candidateTokens <= targetTokens && current.tier !== 'prioritized'
        ? 'prioritized'
        : nextClinicalContextFitTier(current.tier)
      if (nextTier !== current.tier && measuredTokens[nextTier] === undefined) {
        return { ...current, tier: nextTier, measuredTokens }
      }
      return {
        ...current,
        tier: selectBestClinicalContextFitTier(measuredTokens, targetTokens),
        measuredTokens,
        probing: false,
      }
    }))
    // `prioritizedPasses` keeps the effect firing across a convergence pass
    // whose rebuilt context happens to measure identically: without it the
    // no-progress guard below would never run and probing would never settle.
  }, [activeTier, candidateTokens, fitKey, fitState.prioritizedPasses, inputPending, rawDataReady, targetTokens])

  const clinicalContext = useMemo(
    () => (
      allowTextTruncation && activeTier === 'prioritized' &&
      candidateTokens > targetTokens
        ? fitClinicalContextTextToTokenBudget(candidateClinicalContext, targetTokens)
        : candidateClinicalContext
    ),
    [allowTextTruncation, activeTier, candidateClinicalContext, candidateTokens, targetTokens],
  )
  const formattedClinicalContext = useMemo(
    () => (
      allowTextTruncation && activeTier === 'prioritized' &&
      estimateTokens(candidateFormattedClinicalContext) > targetTokens
        ? fitClinicalContextTextToTokenBudget(
            candidateFormattedClinicalContext,
            targetTokens,
          )
        : candidateFormattedClinicalContext
    ),
    [allowTextTruncation, activeTier, candidateFormattedClinicalContext, targetTokens],
  )

  const scopedClinicalData = useMemo(
    // Intermediate tiers cannot be sent or cached. Building their outbound
    // records/catalog only repeats expensive report extraction before the next
    // tier replaces them; the final settled tier still uses the same builder.
    () => (!includeSources || isFitting ? null : prioritizedResult
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
      isFitting,
    ],
  )
  const catalog = useMemo(
    () => (scopedClinicalData ? getSourceCatalog(scopedClinicalData, locale) : []),
    [scopedClinicalData, locale],
  )
  const isCalculating = inputPending || isFitting
  const dataReady = rawDataReady && !isCalculating
  // Do not hydrate or expose a generation slot for an intermediate fitting
  // tier. The signature itself is model-independent once the adapted context
  // has settled.
  const inputSignature = dataReady ? sourceSignature : ''
  const adaptedTokens = useMemo(() => estimateTokens(clinicalContext), [clinicalContext])
  // A reduction driven purely by an explicit clinical cap (no model window)
  // must still be announced rather than applied silently.
  const adaptationLimit = contextLimit && contextLimit > 0
    ? contextLimit
    : maxClinicalTokens && maxClinicalTokens > 0 ? maxClinicalTokens : 0
  const contextAdaptation: ClinicalContextAdaptation | null =
    activeTier === 'full' || !adaptationLimit
      ? null
      : {
          tier: activeTier,
          contextLimit: adaptationLimit,
          targetTokens,
          originalTokens: fitState.key === fitKey
            ? fitState.originalTokens
            : candidateTokens,
          adaptedTokens,
          protectedDocumentCount: preserveManualDocuments ? baseDocumentIds.length : undefined,
          ...(protectedDocuments.length > 0 ? { protectedDocuments } : {}),
          // Diagnostics: builds of the record prioritizer, so a chart that
          // needs repeated convergence passes is visible rather than inferred.
          ...(activeTier === 'prioritized'
            ? { prioritizedPasses: fitState.prioritizedPasses + 1 }
            : {}),
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
    preserveManualDocuments,
    protectedDocuments,
  }
}
