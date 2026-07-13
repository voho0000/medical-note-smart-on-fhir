// Medications Context Hook
// Matches the left panel "Currently in use" logic: status-based AND date-based.
// A medication is currently in use if status is active/completed AND
// (no end date computable OR endDate >= today).
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"
import { pickAiMedicationName } from "@/src/shared/utils/fhir-display-helpers"
import { routeAbbr } from "@/src/shared/utils/route-display"
import { useNow } from "@/src/shared/hooks/use-now.hook"
import {
  durationToDays,
  filterMedicationRecords,
  isChronicMedicationRecord,
  isMedicationCurrentlyInUse,
  normalizeClinicalStatus,
} from "@/src/core/utils/clinical-context-selection.utils"

const RECENTLY_ENDED_WINDOW_DAYS = 90

interface MedSummary {
  name: string
  dose?: string
  route?: string
  frequency?: string
  startedOn?: string
  endDate?: string
  daysRemaining?: number
  state: 'current' | 'ended' | 'other'
  status: string
  isChronic: boolean
  /** Number of refill cycles collapsed into this row (>=1, only set when >1) */
  refillCount?: number
  /** Prescribing / dispensing facility (MedicationRequest.requester.display).
   *  A 藥局/藥房 here is a pharmacy that DISPENSED a script, not a prescriber —
   *  formatLine marks it so the AI never counts it as a duplicate source. */
  org?: string
}

function summarize(
  med: any,
  nowMs: number,
): MedSummary {
  const name = pickAiMedicationName(
    med.medicationCodeableConcept,
    med.medicationReference?.display,
  )
    || 'Unknown medication'

  const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]
  const frequency = dosage?.text || undefined
  // Bare SNOMED route codings (no text/display) resolve to the canonical
  // clinical abbreviation (PO / SC / …) — the AI context always speaks
  // canonical English regardless of UI audience/language.
  const route =
    dosage?.route?.text || dosage?.route?.coding?.[0]?.display || routeAbbr(dosage?.route) || undefined
  const dose = dosage?.doseAndRate?.[0]?.doseQuantity
    ? `${dosage.doseAndRate[0].doseQuantity.value} ${dosage.doseAndRate[0].doseQuantity.unit || ''}`.trim()
    : undefined

  const startedRaw = med.authoredOn || med.effectiveDateTime
  const days = durationToDays(med.dispenseRequest?.expectedSupplyDuration)
    ?? durationToDays(dosage?.timing?.repeat?.boundsDuration)

  let endDate: string | undefined
  let daysRemaining: number | undefined
  if (startedRaw && days) {
    const start = new Date(startedRaw)
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start)
      end.setDate(end.getDate() + days)
      endDate = end.toISOString().slice(0, 10)
      daysRemaining = Math.ceil((end.getTime() - nowMs) / (1000 * 60 * 60 * 24))
    }
  }

  const status = normalizeClinicalStatus(med.status) || 'unknown'
  const current = isMedicationCurrentlyInUse(med, nowMs)
  const endedByStatus = ['stopped', 'completed', 'cancelled', 'ended'].includes(status)
  const state: MedSummary['state'] = current
    ? 'current'
    : endedByStatus || (daysRemaining !== undefined && daysRemaining < 0)
      ? 'ended'
      : 'other'

  return {
    name,
    dose,
    route,
    frequency,
    startedOn: startedRaw ? String(startedRaw).slice(0, 10) : undefined,
    endDate,
    daysRemaining,
    state,
    status,
    isChronic: isChronicMedicationRecord(med),
    org: med.requester?.display,
  }
}

/** A facility whose name is a pharmacy (社區藥局 / 藥房) — it DISPENSES a
 *  script, it does not prescribe, so it can never be a duplicate-therapy
 *  source. */
function isPharmacyOrg(org?: string): boolean {
  return /藥局|藥房/.test(org ?? '')
}

function formatLine(m: MedSummary, mode: 'active' | 'recent' | 'other'): string {
  const parts: string[] = [m.isChronic ? `${m.name} [慢箋]` : m.name]
  const dosing = [m.dose, m.frequency, m.route].filter(Boolean).join(', ')
  if (dosing) parts.push(`(${dosing})`)
  if (mode === 'active') {
    if (m.daysRemaining !== undefined && m.endDate) {
      parts.push(`— until ${m.endDate} (${m.daysRemaining}d left)`)
    } else if (m.startedOn) {
      parts.push(`— since ${m.startedOn}`)
    }
  } else if (mode === 'recent') {
    if (m.endDate) parts.push(`— last ended ${m.endDate}`)
    else if (m.startedOn) parts.push(`— ${m.startedOn}`)
  } else {
    if (m.startedOn) parts.push(`— recorded ${m.startedOn}`)
    if (m.endDate) parts.push(`(calculated supply end ${m.endDate})`)
  }
  if (m.refillCount && m.refillCount > 1) {
    parts.push(`(${m.refillCount} refills)`)
  }
  const statusSemantics = m.status === 'entered-in-error'
    ? '; INVALIDATED—do not treat as a medication'
    : m.status === 'draft'
      ? '; DRAFT—not an active order'
      : m.status === 'on-hold'
        ? '; ON HOLD—not currently in use'
        : ''
  parts.push(`[status: ${m.status}${statusSemantics}]`)
  // Mark the source so the model can apply the duplicate rule: a pharmacy row
  // is a DISPENSING of an existing script, NOT a separate prescription.
  if (m.org) {
    parts.push(isPharmacyOrg(m.org) ? `[藥局領藥 · dispensing, NOT a prescriber: ${m.org}]` : `[開立 by ${m.org}]`)
  }
  return parts.join(' ')
}

/**
 * Collapse refill cycles of the same drug into one row. NHI 慢箋 medications
 * generate a new MedicationRequest every ~28 days, so a single chronic drug
 * can appear 5-6× in the same 90-day window — looks like the patient is
 * "starting and stopping" when they're actually on a stable regimen.
 *
 * Dedup key: drug + dose + route + schedule + organization + lifecycle status.
 * Keep the latest endDate / daysRemaining; track total refill count to surface
 * as `(N refills)` in the prompt.
 */
function dedupByDrug(meds: MedSummary[]): MedSummary[] {
  const byName = new Map<string, MedSummary>()
  for (const m of meds) {
    // Same display name is not enough: different strengths, routes, schedules,
    // facilities or lifecycle statuses may represent a real regimen change.
    const key = [m.name, m.dose, m.route, m.frequency, m.org, m.status].join('|')
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...m, refillCount: 1 })
      continue
    }
    existing.refillCount = (existing.refillCount ?? 1) + 1
    // Prefer the row with the most recent endDate.
    if (m.endDate && (!existing.endDate || m.endDate > existing.endDate)) {
      existing.endDate = m.endDate
      existing.daysRemaining = m.daysRemaining
      existing.dose = m.dose ?? existing.dose
      existing.frequency = m.frequency ?? existing.frequency
      existing.route = m.route ?? existing.route
    }
    // Keep earliest startedOn so "since" stays meaningful.
    if (m.startedOn && (!existing.startedOn || m.startedOn < existing.startedOn)) {
      existing.startedOn = m.startedOn
    }
  }
  return Array.from(byName.values())
}

export function useMedicationsContext(
  includeMedications: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters,
  // Retained for API compatibility. The medication section remains
  // authoritative even when visit-linked records are repeated chronologically.
  _encountersShown: boolean = false
): ClinicalContextSection | null {
  // See useNow: re-run when the day rolls over so daysRemaining / recently-ended
  // windows fed to the AI don't go stale on a long-lived tab.
  const nowMs = useNow()
  return useMemo(() => {
    if (!includeMedications || !clinicalData?.medications?.length) return null

    // The medication section is the authoritative, filter-faithful list. Visit-
    // linked records may also be repeated under their encounter for chronology;
    // never remove them here, because the encounter and medication windows can
    // differ and cross-section "dedup" previously made records disappear.
    const meds = filterMedicationRecords(
      clinicalData.medications,
      filters,
      clinicalData as { encounters?: any[] },
      nowMs,
    )
    if (meds.length === 0) return null

    const summaries = meds.map((m: any) => summarize(m, nowMs))

    const now = nowMs
    const recentThreshold = now - RECENTLY_ENDED_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const activeRaw: MedSummary[] = []
    const recentRaw: MedSummary[] = []
    const pastRaw: MedSummary[] = []
    const otherRaw: MedSummary[] = []

    for (const s of summaries) {
      if (s.state === 'current') {
        activeRaw.push(s)
      } else if (s.state === 'other') {
        otherRaw.push(s)
      } else if (s.endDate && new Date(s.endDate).getTime() >= recentThreshold) {
        recentRaw.push(s)
      } else {
        pastRaw.push(s)
      }
    }

    // Collapse refill cycles of the same drug — NHI 慢箋 produces a new
    // MedicationRequest every ~28 days; without dedup a single chronic drug
    // shows up 5-6× and the AI misreads it as frequent regimen changes.
    const active = dedupByDrug(activeRaw)
    const recent = dedupByDrug(recentRaw)
    const pastUnique = dedupByDrug(pastRaw)
    const other = dedupByDrug(otherRaw)

    if (filters?.medicationStatus === 'active') {
      recent.length = 0
      pastUnique.length = 0
      other.length = 0
    }

    const items: string[] = []

    if (active.length > 0) {
      items.push(`Currently in use (${active.length}):`)
      active.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity))
      active.forEach((m) => items.push(`  • ${formatLine(m, 'active')}`))
    }

    if (recent.length > 0) {
      if (items.length > 0) items.push('')
      items.push(`Recently ended (last ${RECENTLY_ENDED_WINDOW_DAYS} days, ${recent.length}):`)
      recent.sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))
      recent.forEach((m) => items.push(`  • ${formatLine(m, 'recent')}`))
    }

    if (pastUnique.length > 0) {
      if (items.length > 0) items.push('')
      items.push(`Past medications (older than ${RECENTLY_ENDED_WINDOW_DAYS} days, ${pastUnique.length}):`)
      pastUnique.sort((a, b) => (b.endDate || b.startedOn || '').localeCompare(a.endDate || a.startedOn || ''))
      pastUnique.forEach((m) => items.push(`  • ${formatLine(m, 'recent')}`))
    }

    if (other.length > 0) {
      if (items.length > 0) items.push('')
      items.push(`Other medication records — not active (${other.length}):`)
      other
        .sort((a, b) => (b.startedOn || '').localeCompare(a.startedOn || ''))
        .forEach((m) => items.push(`  • ${formatLine(m, 'other')}`))
    }

    if (items.length === 0) return null
    items.push('', 'Record-fidelity note: visit-linked medication records may also appear under their visit; do not count repeated records as separate prescriptions.')
    return { title: "Patient's Medications", items }
  }, [includeMedications, clinicalData, filters, nowMs])
}
