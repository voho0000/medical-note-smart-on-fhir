// How big the loaded chart is, in resources — the size half of `ai_result`.
//
// Recorded ONLY when the chart is actually handed to a model (owner decision,
// 2026-09-04). Opening a patient measures nothing; the counts exist to give
// every AI outcome a data volume to be read against, because a timeout on a
// 200-resource chart and a timeout on a 20,000-resource one are not the same
// event.
//
// PHI boundary: totals only. Never an id, a name, a date, a code, a value, or
// any text. A count cannot be inverted into a chart.
'use client'

import { useMemo } from 'react'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import type {
  FedResourceCounts,
  PatientResourceCounts,
} from '@/src/application/telemetry/usage-analytics'

export type { FedResourceCounts, PatientResourceCounts }

/**
 * The collection fields both counters walk — ONE list on purpose.
 *
 * Because the loaded totals and the fed counts cover exactly the same set,
 * `resource_count - fed_resource_count` means precisely "resources dropped by
 * Data Selection and context fitting", with no correction term. A second list
 * would make that subtraction quietly wrong the first time the two drifted, so
 * they are not allowed to drift.
 *
 * Two deliberate absences:
 * - `vitalSigns` — the vital-signs subset of `observations`, produced by the
 *   same query. Counting it would count those resources twice and inflate
 *   every chart that records a blood pressure.
 * - `medicationRemainingSummaries` — an app-derived remaining-days view, not
 *   patient data and never a prompt candidate. Counting it on the loaded side
 *   only (the fed context has no such field) would show a permanent phantom
 *   difference that looks exactly like trimming.
 */
const COUNTED_COLLECTIONS = [
  'conditions',
  'medications',
  'allergies',
  'observations',
  'diagnosticReports',
  'imagingStudies',
  'procedures',
  'encounters',
  'documentReferences',
  'compositions',
  'immunizations',
  'consents',
  'devices',
  'carePlans',
] as const satisfies readonly (keyof ClinicalDataCollection)[]

function sizeOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

/** Pure, so the arithmetic can be asserted without a React tree. */
export function countPatientResources(
  data: Pick<ClinicalDataCollection, (typeof COUNTED_COLLECTIONS)[number]>,
): PatientResourceCounts {
  const record = data as unknown as Record<string, unknown>
  let total = 0
  for (const field of COUNTED_COLLECTIONS) total += sizeOf(record[field])
  return {
    resource_count: total,
    obs_count: sizeOf(record.observations),
    // MedicationRequest and MedicationStatement arrive from one fetcher and
    // are merged into a single list everywhere in the app; counting them
    // separately here would describe a distinction the UI does not make.
    med_count: sizeOf(record.medications),
    doc_count: sizeOf(record.documentReferences),
    encounter_count: sizeOf(record.encounters),
    report_count: sizeOf(record.diagnosticReports),
  }
}

/**
 * The counts for the chart currently loaded, or `undefined` when none is.
 *
 * `useClinicalDataQuery().data` is the app's own definition of "loaded": it
 * stays `undefined` until EVERY resource type has settled, which is the same
 * gate the whole-chart consumers (IPS export, FHIR tools) use. A half-loaded
 * chart therefore reports no counts rather than a misleadingly small total.
 *
 * Read by each AI surface directly instead of being threaded down through the
 * generation layers: every caller already sits inside the React Query tree
 * (they all depend on usePatient / useClinicalAiInput), so this adds no new
 * provider requirement, and React Query dedupes the subscription.
 */
export function useLoadedPatientCounts(): PatientResourceCounts | undefined {
  const { data } = useClinicalDataQuery()
  return useMemo(() => (data ? countPatientResources(data) : undefined), [data])
}


// ============================================================================
// What actually reached the model
// ============================================================================

/** The AI context's shape (`SummaryCatalogInput`): the same collection keys as
 *  the loaded chart, every one optional, so a missing field counts as 0. */
export type FedClinicalContext = {
  [K in (typeof COUNTED_COLLECTIONS)[number]]?: unknown[]
}

/**
 * Count the resources present in the FINAL context handed to the model —
 * after Data Selection and after every context-fitting tier.
 *
 * Walks the SAME field list as countPatientResources, so subtracting the two
 * `*_resource_count` values yields exactly what was trimmed.
 *
 * Caveat worth knowing when reading the numbers: the last-resort tier fits the
 * serialized TEXT to a token budget, which can clip trailing records that are
 * still present in this structured input. So `fed_*` is an upper bound on the
 * final prompt in that one tier; `context_tokens` is the exact size of what
 * actually went out, which is why both are reported.
 */
export function countContextResources(context: FedClinicalContext): FedResourceCounts {
  const record = context as Record<string, unknown>
  let total = 0
  for (const field of COUNTED_COLLECTIONS) total += sizeOf(record[field])
  return {
    fed_resource_count: total,
    fed_obs_count: sizeOf(record.observations),
    fed_med_count: sizeOf(record.medications),
    fed_doc_count: sizeOf(record.documentReferences),
    fed_encounter_count: sizeOf(record.encounters),
    fed_report_count: sizeOf(record.diagnosticReports),
  }
}

/**
 * The fed set for a report interpretation: exactly one DiagnosticReport, by
 * construction — that surface never receives a chart, only the single report
 * the user pressed the button on. The other four fields are omitted rather
 * than sent as 0, because "not applicable to this surface" and "this surface
 * fed zero medications" are different statements.
 */
export const SINGLE_REPORT_FED_COUNTS: Partial<FedResourceCounts> = Object.freeze({
  fed_resource_count: 1,
  fed_report_count: 1,
})
