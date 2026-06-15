// IPS curation — narrows the full ClinicalDataCollection down to the curated
// subset the user has chosen in the 資料選擇 (data-selection) tab.
//
// An IPS is "a coherent snapshot ... a subset of the available information"
// (HL7 IPS IG) — NOT a multi-year data dump. Rather than invent a second set of
// filters, we honor exactly what the user already curated for the AI context:
// the `selectedData` category toggles + `DataFilters`. The per-section semantics
// mirror the existing, tested filtering used elsewhere in the app:
//   - medications  → useMedicationsContext (chronic/acute, time range, dedup by
//                    drug name, "現用藥/慢箋為主" = currently-in-use OR chronic)
//   - problem list → useProblemListContext (problem-list-item + active status)
//   - reports/vitals/procedures → generate-clinical-context.use-case
//     (filterByTimeRange + latest-version dedup)
//
// Pure functions only (no React) so the builder/tests can call this directly.

import type {
  CarePlanEntity,
  ClinicalDataCollection,
  ConditionEntity,
  DiagnosticReportEntity,
  ImmunizationEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  DataFilters,
  DataSelection,
  TimeRange,
} from '@/src/core/entities/clinical-context.entity'
import { isChronicPrescription } from '@/src/shared/utils/fhir-display-helpers'
import { orphanResultObservations } from './ips-helpers'
import { findSctForCondition } from './snomed-mapping'

export interface CurateForIpsInput {
  data: ClinicalDataCollection
  selection: DataSelection
  filters: DataFilters
  /** Reference "now" for time-range filtering (injectable for deterministic tests). */
  now?: Date
}

// --- Shared predicates (mirrors useProblemListContext) ---------------------

function isProblemListItem(cond: ConditionEntity): boolean {
  return (cond.category ?? []).some((cat) =>
    (cat.coding ?? []).some((c) => c.code === 'problem-list-item'),
  )
}

function isActiveCondition(cond: ConditionEntity): boolean {
  const s = (cond.clinicalStatus || '').toLowerCase()
  if (!s) return true // no status recorded ⇒ treat as active (matches app)
  return s === 'active' || s === 'recurrence' || s === 'relapse'
}

// Statuses that mean a medication order is no longer being taken. Chronic
// (慢箋) refills are still surfaced even when an individual cycle is completed.
const INACTIVE_MED_STATUS = new Set([
  'stopped',
  'completed',
  'cancelled',
  'entered-in-error',
  'on-hold',
])

function isCurrentMed(med: MedicationEntity): boolean {
  return !INACTIVE_MED_STATUS.has((med.status || '').toLowerCase())
}

/** Dedup key for refill collapsing — same drug name = same row. */
function medName(med: MedicationEntity): string {
  const cc = med.medicationCodeableConcept
  return (
    cc?.text?.trim() ||
    cc?.coding?.find((c) => c.display)?.display?.trim() ||
    cc?.coding?.find((c) => c.code)?.code?.trim() ||
    med.id ||
    ''
  )
}

// --- Time-range filtering (mirrors generate-clinical-context.use-case) ------

function rangeStart(range: TimeRange, now: Date): Date | null {
  if (range === 'all') return null
  const d = new Date(now)
  switch (range) {
    case '24h':
      d.setDate(now.getDate() - 1)
      break
    case '3d':
      d.setDate(now.getDate() - 3)
      break
    case '1w':
      d.setDate(now.getDate() - 7)
      break
    case '1m':
      d.setMonth(now.getMonth() - 1)
      break
    case '3m':
      d.setMonth(now.getMonth() - 3)
      break
    case '6m':
      d.setMonth(now.getMonth() - 6)
      break
    case '1y':
      d.setFullYear(now.getFullYear() - 1)
      break
    case '3y':
      d.setFullYear(now.getFullYear() - 3)
      break
    case '5y':
      d.setFullYear(now.getFullYear() - 5)
      break
  }
  return d
}

function withinRange<T>(
  items: T[],
  range: TimeRange,
  now: Date,
  getDate: (i: T) => string | undefined,
): T[] {
  const start = rangeStart(range, now)
  if (!start) return items
  const startMs = start.getTime()
  return items.filter((i) => {
    const ds = getDate(i)
    if (!ds) return false // undated items drop out of a bounded window
    const t = new Date(ds).getTime()
    return !Number.isNaN(t) && t >= startMs
  })
}

/**
 * Keep only the most recent item per key (panel name / type). Items with no
 * key are passed through untouched (kept distinct), never collapsed together.
 */
function latestPerKey<T>(
  items: T[],
  keyOf: (i: T) => string,
  dateOf: (i: T) => string | undefined,
): T[] {
  const sorted = [...items].sort((a, b) => (dateOf(b) || '').localeCompare(dateOf(a) || ''))
  const out = new Map<string, T>()
  let nokey = 0
  for (const it of sorted) {
    const k = keyOf(it).trim()
    if (!k) {
      out.set(`__nokey_${nokey++}`, it)
      continue
    }
    if (!out.has(k)) out.set(k, it)
  }
  return Array.from(out.values())
}

// --- Per-section curators ---------------------------------------------------

function curateConditions(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
): ConditionEntity[] {
  if (!selection.problemList) return []
  const problemItems = data.conditions.filter(isProblemListItem)
  // Prefer the curated problem-list-item set (the app's Problem List view).
  // Fall back to all conditions when the source doesn't tag problem-list-item
  // (e.g. non-bridge FHIR) so the IPS-required Problem List section isn't empty.
  const base = problemItems.length > 0 ? problemItems : data.conditions
  const filtered = filters.problemListStatus === 'active' ? base.filter(isActiveCondition) : base
  return annotateConditionsWithSct(filtered)
}

/**
 * IPS Phase 2.1 — attach a verified SNOMED CT problem-list code (`_sct`) to each
 * condition whose ICD-10 coding hits the deterministic allowlist (Strategy B,
 * confidence 'high'). Returns NEW condition objects (never mutates the input) so
 * the annotation is local to the IPS snapshot and doesn't leak into the shared
 * ClinicalDataCollection used elsewhere in the app. Conditions without a
 * verified mapping pass through unchanged (no SCT invented — that is Phase 2.2).
 */
export function annotateConditionsWithSct(conditions: ConditionEntity[]): ConditionEntity[] {
  return conditions.map((c) => {
    const sct = findSctForCondition(c)
    return sct ? { ...c, _sct: sct } : c
  })
}

function curateMedications(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): MedicationEntity[] {
  if (!selection.medications) return []
  let meds = data.medications

  // Chronic / acute filter.
  if (filters.medicationChronic === 'chronic') {
    meds = meds.filter((m) => isChronicPrescription(m))
  } else if (filters.medicationChronic === 'acute') {
    meds = meds.filter((m) => !isChronicPrescription(m))
  }

  // Time-range filter on authoredOn.
  meds = withinRange(meds, filters.medicationTimeRange, now, (m) => m.authoredOn)

  // 現用藥 / 慢箋為主: when restricted to "active", keep meds that are
  // currently-in-use OR are chronic refill prescriptions (which read as
  // "completed" between cycles but are clinically ongoing).
  if (filters.medicationStatus === 'active') {
    meds = meds.filter((m) => isCurrentMed(m) || isChronicPrescription(m))
  }

  // Collapse refill cycles of the same drug; keep the most recent authoredOn.
  const byName = new Map<string, MedicationEntity>()
  for (const m of meds) {
    const key = medName(m)
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, m)
      continue
    }
    if ((m.authoredOn || '') > (existing.authoredOn || '')) byName.set(key, m)
  }
  return Array.from(byName.values())
}

function curateImmunizations(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): ImmunizationEntity[] {
  if (!selection.immunizations) return []
  return withinRange(
    data.immunizations,
    filters.immunizationTimeRange,
    now,
    (im) => im.occurrenceDateTime,
  )
}

function curateDiagnosticReports(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): DiagnosticReportEntity[] {
  if (!selection.labReports) return []
  let reports = withinRange(
    data.diagnosticReports,
    filters.labReportTimeRange,
    now,
    (r) => r.effectiveDateTime,
  )
  if (filters.labReportVersion === 'latest') {
    reports = latestPerKey(
      reports,
      (r) => r.code?.text || '',
      (r) => r.effectiveDateTime,
    )
  }
  return reports
}

function curateObservations(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): ObservationEntity[] {
  // Orphan / standalone lab observations. No dedicated time filter exists for
  // these, so reuse the lab-report window to keep them from bloating Results.
  if (!selection.observations) return []
  // The data layer puts EVERY Observation here — including ones already nested
  // under a DiagnosticReport (`_observations`) and vital-sign observations.
  // Keep only the true orphans so the Results section doesn't show a value row
  // AND a "N observation(s)" report row for the same analyte.
  const orphans = orphanResultObservations(data.diagnosticReports, data.observations)
  let obs = withinRange(orphans, filters.labReportTimeRange, now, (o) => o.effectiveDateTime)
  if (filters.labReportVersion === 'latest') {
    obs = latestPerKey(
      obs,
      (o) => o.code?.text || '',
      (o) => o.effectiveDateTime,
    )
  }
  return obs
}

function curateVitalSigns(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): ObservationEntity[] {
  if (!selection.vitalSigns) return []
  let vitals = withinRange(
    data.vitalSigns,
    filters.vitalSignsTimeRange,
    now,
    (v) => v.effectiveDateTime,
  )
  if (filters.vitalSignsVersion === 'latest') {
    vitals = latestPerKey(
      vitals,
      (v) => v.code?.text || '',
      (v) => v.effectiveDateTime,
    )
  }
  return vitals
}

function curateProcedures(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
  now: Date,
): ProcedureEntity[] {
  if (!selection.procedures) return []
  const dateOf = (p: ProcedureEntity) =>
    p.performedDateTime || p.performedPeriod?.end || p.performedPeriod?.start
  let procs = withinRange(data.procedures, filters.procedureTimeRange, now, dateOf)
  if (filters.procedureVersion === 'latest') {
    procs = latestPerKey(procs, (p) => p.code?.text || p.code?.coding?.[0]?.display || '', dateOf)
  }
  return procs
}

function curateCarePlans(
  data: ClinicalDataCollection,
  selection: DataSelection,
  filters: DataFilters,
): CarePlanEntity[] {
  if (!selection.carePlans) return []
  return filters.carePlanStatus === 'active'
    ? data.carePlans.filter((cp) => cp.status === 'active')
    : data.carePlans
}

/**
 * Produce a curated ClinicalDataCollection for IPS assembly by honoring the
 * data-selection tab's category toggles + filters. Advance directives, devices
 * and care plans now honor their toggles too; resources the IPS builder doesn't
 * read (encounters, document references, compositions) pass through unchanged.
 * Documents (Composition) are intentionally chat/insights-only — not folded
 * back into the IPS, which is itself a Composition.
 */
export function curateForIps(input: CurateForIpsInput): ClinicalDataCollection {
  const { data, selection, filters } = input
  const now = input.now ?? new Date()
  return {
    ...data,
    conditions: curateConditions(data, selection, filters),
    medications: curateMedications(data, selection, filters, now),
    allergies: selection.allergies ? data.allergies : [],
    immunizations: curateImmunizations(data, selection, filters, now),
    diagnosticReports: curateDiagnosticReports(data, selection, filters, now),
    observations: curateObservations(data, selection, filters, now),
    vitalSigns: curateVitalSigns(data, selection, filters, now),
    procedures: curateProcedures(data, selection, filters, now),
    consents: selection.advanceDirectives ? data.consents : [],
    devices: selection.medicalDevices ? data.devices : [],
    carePlans: curateCarePlans(data, selection, filters),
  }
}
