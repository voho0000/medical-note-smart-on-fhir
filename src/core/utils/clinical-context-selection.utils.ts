import type { DataFilters, TimeRange } from '@/src/core/entities/clinical-context.entity'
import { makeTimeRangeTest } from '@/src/core/utils/date-filter.utils'

const DAY_MS = 24 * 60 * 60 * 1000

export function normalizeClinicalStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

export function durationToDays(duration: any): number | undefined {
  const value = Number(duration?.value)
  if (!Number.isFinite(value) || value <= 0) return undefined
  const unit = String(duration?.unit || duration?.code || '').toLowerCase()
  const factor =
    unit.startsWith('d') ? 1 :
    unit.startsWith('w') ? 7 :
    unit.startsWith('mo') || unit === 'month' || unit === 'months' ? 30 :
    unit.startsWith('y') || unit === 'a' ? 365 :
    unit === 'h' || unit.startsWith('hour') ? 1 / 24 :
    1
  return Math.round(value * factor)
}

export function medicationExpectedEnd(medication: any): string | undefined {
  const dosage = medication?.dosageInstruction?.[0] || medication?.dosage?.[0]
  const days = durationToDays(medication?.dispenseRequest?.expectedSupplyDuration)
    ?? durationToDays(dosage?.timing?.repeat?.boundsDuration)
  const started = medication?.authoredOn || medication?.effectiveDateTime
  if (!started || !days) return undefined
  const date = new Date(started)
  if (Number.isNaN(date.getTime())) return undefined
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Lifecycle statuses that positively DENY current use. These are never promoted
 * to a current medicine however generous the supply window looks: the source
 * has made an explicit statement that the order is not running.
 */
const NOT_IN_USE_STATUSES = new Set([
  'draft',
  'on-hold',
  'stopped',
  'cancelled',
  'entered-in-error',
  'ended',
])

/**
 * A medication record is "current" when nothing denies it and there is positive
 * evidence it is running on the reference date.
 *
 * Two kinds of evidence are accepted, because two kinds of source exist:
 *
 * 1. **A computable supply window.** A dispensing/claims feed (the NHI 健保存摺
 *    bridge is the motivating case) records what was actually dispensed and for
 *    how many days, but leaves `status` at `unknown` for every row — it has no
 *    lifecycle model to report. The days-supply IS the evidence there, so a
 *    window that still covers the reference date means the medicine is current
 *    regardless of the (uninformative) status. Rejecting `unknown` wholesale
 *    made every such record invisible under the default `active` filter.
 * 2. **An explicit `active` status**, for order-based sources that carry a real
 *    lifecycle but no days-supply.
 *
 * A record with neither — `completed`/`unknown`/absent status and no computable
 * window — stays out: nothing about it says the patient is taking it today.
 */
export function isMedicationCurrentlyInUse(medication: any, nowMs: number): boolean {
  const status = normalizeClinicalStatus(medication?.status)
  if (NOT_IN_USE_STATUSES.has(status)) return false

  const end = medicationExpectedEnd(medication)
  if (end) {
    const endMs = Date.parse(end)
    return Number.isFinite(endMs) && endMs >= nowMs - DAY_MS
  }
  return status === 'active'
}

export function isChronicMedicationRecord(medication: any): boolean {
  const coding = medication?.courseOfTherapyType?.coding
  return Array.isArray(coding) && coding.some((item: any) => item?.code === 'continuous')
}

export function filterMedicationRecords(
  medications: any[],
  filters: Partial<DataFilters> | undefined,
  clinicalData: { encounters?: any[] } | null | undefined,
  nowMs: number,
): any[] {
  const chronic = filters?.medicationChronic ?? 'all'
  const timeRange = filters?.medicationTimeRange ?? 'all'
  const keepCurrent = filters?.medicationKeepCurrentRegardlessOfRange === true
  const inWindow = makeTimeRangeTest(timeRange, clinicalData)

  return medications.filter((medication) => {
    if (chronic === 'chronic' && !isChronicMedicationRecord(medication)) return false
    if (chronic === 'acute' && isChronicMedicationRecord(medication)) return false
    const date = medication?.authoredOn || medication?.effectiveDateTime
    // A window the *user* saved is authoritative and narrows current medicines
    // like anything else. Only the adaptive context ladder — which narrows the
    // medication window to 1y (trimmed) / 6m (compact) on its own initiative —
    // sets keepCurrent, so that an automatic reduction cannot silently hide a
    // long-term order authored two years ago. Historical records keep narrowing
    // with the window at every tier.
    if (!inWindow(date) && !(keepCurrent && isMedicationCurrentlyInUse(medication, nowMs))) return false
    if (filters?.medicationStatus === 'active' && !isMedicationCurrentlyInUse(medication, nowMs)) return false
    return true
  })
}

export function procedureDate(procedure: any): string | undefined {
  return procedure?.performedDateTime || procedure?.performedPeriod?.end || procedure?.performedPeriod?.start
}

export function filterProcedureRecords(
  procedures: any[],
  filters: Partial<DataFilters> | undefined,
  clinicalData: { encounters?: any[] } | null | undefined,
): any[] {
  const inWindow = makeTimeRangeTest(filters?.procedureTimeRange ?? 'all', clinicalData)
  let filtered = procedures.filter((procedure) => inWindow(procedureDate(procedure)))
  if (filters?.procedureVersion !== 'latest') return filtered

  const latestByName = new Map<string, any>()
  for (const procedure of filtered) {
    const name = procedure?.code?.text || procedure?.code?.coding?.[0]?.display || 'Procedure'
    const existing = latestByName.get(name)
    if (!existing || (procedureDate(procedure) || '') > (procedureDate(existing) || '')) {
      latestByName.set(name, procedure)
    }
  }
  filtered = [...latestByName.values()]
  return filtered
}

export function filterEncounterRecords(
  encounters: any[],
  range: TimeRange,
  clinicalData: { encounters?: any[] } | null | undefined,
): any[] {
  const inWindow = makeTimeRangeTest(range, clinicalData)
  return [...encounters]
    .filter((encounter) => range === 'all' || inWindow(encounter?.period?.start))
    .sort((a, b) => (b?.period?.start || '').localeCompare(a?.period?.start || ''))
}
