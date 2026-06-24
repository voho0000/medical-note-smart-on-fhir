// Canonical Observation classification for ClinicalDataCollection.
//
// SINGLE SOURCE OF TRUTH for the question "which observations are standalone
// vs. already shown elsewhere (inside a DiagnosticReport, or in the vitals
// section)?".
//
// Background — see the OBSERVATION SUPERSET INVARIANT on `ClinicalDataCollection`
// (src/core/entities/clinical-data.entity.ts): `observations` is the COMPLETE
// superset; `vitalSigns` and DiagnosticReport members
// (`result[].reference` / `_observations[].id`) are subsets re-listed inside it
// by the same resource id. Before this module, several features each re-derived
// "report member ids" and "is this a vital" inline, with subtly different rules
// (some used `result[].reference`, some `_observations[].id`; some keyed vitals
// off a category code, some off the `vitalSigns` id list). Those divergences
// produced duplicate and mislabeled rows. Every feature that needs standalone
// observations should compose the helpers here so the dedup rule lives in
// exactly one place.

import type {
  ClinicalDataCollection,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import { inferGroupFromObservation } from '@/src/shared/utils/report-grouping-helpers'

/** Minimal shape the selectors read; tolerant of partial / nullable inputs. */
export type ObservationSource = Partial<
  Pick<ClinicalDataCollection, 'observations' | 'vitalSigns' | 'diagnosticReports'>
>

/**
 * Minimal structural shape needed to decide report membership. Both
 * `DiagnosticReportEntity` (core) and the shared `DiagnosticReport` FHIR type
 * satisfy it, so consumers can pass either without casting.
 */
interface ReportMemberSource {
  result?: Array<{ reference?: string }> | null
  _observations?: Array<{ id?: string }> | null
}

/**
 * Bare resource id from a FHIR reference string.
 *
 * Handles every literal-reference form the spec allows, so a reference always
 * reduces to the same id its target resource carries:
 *   - relative:      "Observation/123"                  -> "123"
 *   - versioned:     "Observation/123/_history/2"        -> "123"
 *   - absolute URL:  "https://h/baseR4/Observation/123"  -> "123"
 *   - urn:uuid:      "urn:uuid:9355c5dc-…"               -> "9355c5dc-…"
 *   - urn:oid:       "urn:oid:1.2.3.4.5"                 -> "1.2.3.4.5"
 *
 * URN-form references (used by document/collection/transaction bundles) carry
 * no "/" separator, so the old `split('/').pop()` left the `urn:uuid:` scheme
 * attached and never matched a resource id. NOTE: for locally-imported bundles
 * references are already canonicalised to the relative form at ingestion (see
 * `canonicalizeBundleResources` in local-bundle.service.ts); this URN handling
 * is the defensive second line for any path that still sees a raw reference.
 */
export function referenceId(reference?: string): string | undefined {
  if (!reference) return undefined
  let ref = reference
  if (ref.startsWith('urn:uuid:')) ref = ref.slice('urn:uuid:'.length)
  else if (ref.startsWith('urn:oid:')) ref = ref.slice('urn:oid:'.length)
  // Drop a trailing version specifier, then take the last path segment.
  ref = ref.replace(/\/_history\/[^/]+$/, '')
  return ref.split('/').pop() || undefined
}

/**
 * Ids of every Observation that belongs to a DiagnosticReport.
 *
 * Unions BOTH linkage shapes the data layer can emit, so "is a report member"
 * is decided identically everywhere:
 *   - `report.result[].reference` — the FHIR-standard link, and
 *   - `report._observations[].id` — the app's enriched re-attachment / _include.
 * Unioning is strictly more complete than either alone; it is the correct dedup
 * key and what fixed the IPS Diagnostic Results duplicate-row bug.
 */
export function collectReportMemberIds(
  reports?: ReadonlyArray<ReportMemberSource> | null,
): Set<string> {
  const ids = new Set<string>()
  for (const report of reports ?? []) {
    for (const ref of report.result ?? []) {
      const id = referenceId(ref.reference)
      if (id) ids.add(id)
    }
    for (const obs of report._observations ?? []) {
      if (obs.id) ids.add(obs.id)
    }
  }
  return ids
}

/**
 * True when an Observation is a vital sign.
 *
 * Canonical test = the shared `inferGroupFromObservation` categorizer returns
 * `vitals`, OR the id appears in the data layer's `vitalSigns` subset (pass it
 * via `vitalIds` when available). Both sources can independently flag a vital;
 * using their union keeps a vital from leaking into the Results / Other lists.
 */
export function isVitalObservation(
  obs: ObservationEntity,
  vitalIds?: Set<string | undefined>,
): boolean {
  if (vitalIds && obs.id != null && vitalIds.has(obs.id)) return true
  return inferGroupFromObservation(obs) === 'vitals'
}

function vitalIdSet(data: ObservationSource): Set<string | undefined> {
  return new Set((data.vitalSigns ?? []).map((v) => v.id))
}

/**
 * Standalone result observations folded into Lab Reports: not a member of any
 * DiagnosticReport, not a vital sign, and not imaging. This intentionally also
 * captures previously "Other Observations" leftovers so the data-selection UI
 * does not need a separate low-signal category.
 */
export function selectStandaloneResultObservations(
  data?: ObservationSource | null,
): ObservationEntity[] {
  if (!data) return []
  const memberIds = collectReportMemberIds(data.diagnosticReports)
  const vitals = vitalIdSet(data)
  return (data.observations ?? []).filter((o) => {
    if (o.id != null && memberIds.has(o.id)) return false
    if (isVitalObservation(o, vitals)) return false
    return inferGroupFromObservation(o) !== 'imaging'
  })
}

/**
 * Standalone LAB observations only. Kept as a focused selector for callers/tests
 * that need the stricter boundary; the data-selection Lab Reports category now
 * uses selectStandaloneResultObservations().
 */
export function selectLabOrphanObservations(
  data?: ObservationSource | null,
): ObservationEntity[] {
  return selectStandaloneResultObservations(data).filter((o) => inferGroupFromObservation(o) === 'lab')
}

/**
 * Catch-all "Other Observations": NOT lab, NOT imaging, NOT vital. Lab obs go to
 * Lab Reports, imaging obs to Imaging Reports, vitals to the Vital Signs
 * section — so this is only the leftover that nothing else claims.
 */
export function selectOtherObservations(
  data?: ObservationSource | null,
): ObservationEntity[] {
  if (!data) return []
  const vitals = vitalIdSet(data)
  return (data.observations ?? []).filter((o) => {
    if (isVitalObservation(o, vitals)) return false
    const group = inferGroupFromObservation(o)
    return group !== 'lab' && group !== 'imaging'
  })
}
