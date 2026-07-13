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
 * A medication record is "current" only when both its lifecycle status and
 * computable supply window allow that interpretation. Unknown/draft/on-hold/
 * entered-in-error records remain available in the `all` view but are never
 * silently promoted to an active medicine.
 */
export function isMedicationCurrentlyInUse(medication: any, nowMs: number): boolean {
  const status = normalizeClinicalStatus(medication?.status)
  if (!status || ['draft', 'on-hold', 'stopped', 'cancelled', 'entered-in-error', 'unknown', 'ended'].includes(status)) {
    return false
  }
  if (status !== 'active' && status !== 'completed') return false

  const end = medicationExpectedEnd(medication)
  if (!end) return status === 'active'
  const endMs = Date.parse(end)
  return Number.isFinite(endMs) && endMs >= nowMs - DAY_MS
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
  const inWindow = makeTimeRangeTest(timeRange, clinicalData)

  return medications.filter((medication) => {
    if (chronic === 'chronic' && !isChronicMedicationRecord(medication)) return false
    if (chronic === 'acute' && isChronicMedicationRecord(medication)) return false
    const date = medication?.authoredOn || medication?.effectiveDateTime
    if (!inWindow(date)) return false
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
