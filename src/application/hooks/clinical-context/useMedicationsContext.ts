// Medications Context Hook
// Matches the left panel "Currently in use" logic: status-based AND date-based.
// A medication is currently in use if status is active/completed AND
// (no end date computable OR endDate >= today).
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/features/clinical-summary/medications/utils/fhir-helpers"

const RECENTLY_ENDED_WINDOW_DAYS = 90

interface MedSummary {
  name: string
  dose?: string
  route?: string
  frequency?: string
  startedOn?: string
  endDate?: string
  daysRemaining?: number
  isInactive: boolean
  isChronic: boolean
}

function isChronicMedication(med: any): boolean {
  const coding = med?.courseOfTherapyType?.coding
  if (!Array.isArray(coding)) return false
  return coding.some((c: any) => c?.code === 'continuous')
}

function isWithinTimeRangeDays(date: string | undefined, range: string): boolean {
  if (range === 'all' || !date) return true
  const ms = Date.parse(date)
  if (Number.isNaN(ms)) return false
  const days =
    range === '1m' ? 30 :
    range === '3m' ? 90 :
    range === '6m' ? 180 :
    range === '1y' ? 365 :
    Infinity
  return Date.now() - ms <= days * 86400000
}

function toDays(duration: any): number | undefined {
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

function summarize(
  med: any,
  audience: 'medical' | 'patient',
  locale: string,
): MedSummary {
  const name = pickLocalizedText(med.medicationCodeableConcept, audience, locale)
    || med.medicationCodeableConcept?.text
    || med.medicationCodeableConcept?.coding?.[0]?.display
    || med.medicationReference?.display
    || 'Unknown medication'

  const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]
  const frequency = dosage?.text || undefined
  const route = dosage?.route?.text || dosage?.route?.coding?.[0]?.display || undefined
  const dose = dosage?.doseAndRate?.[0]?.doseQuantity
    ? `${dosage.doseAndRate[0].doseQuantity.value} ${dosage.doseAndRate[0].doseQuantity.unit || ''}`.trim()
    : undefined

  const startedRaw = med.authoredOn || med.effectiveDateTime
  const days = toDays(med.dispenseRequest?.expectedSupplyDuration)
    ?? toDays(dosage?.timing?.repeat?.boundsDuration)

  let endDate: string | undefined
  let daysRemaining: number | undefined
  if (startedRaw && days) {
    const start = new Date(startedRaw)
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start)
      end.setDate(end.getDate() + days)
      endDate = end.toISOString().slice(0, 10)
      daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }
  }

  const status = String(med.status || '').toLowerCase()
  const statusInactive = status === 'stopped' || status === 'completed' || status === 'cancelled'
  const isInactive = statusInactive || (daysRemaining !== undefined && daysRemaining < 0)

  return {
    name,
    dose,
    route,
    frequency,
    startedOn: startedRaw ? String(startedRaw).slice(0, 10) : undefined,
    endDate,
    daysRemaining,
    isInactive,
    isChronic: isChronicMedication(med),
  }
}

function formatLine(m: MedSummary, mode: 'active' | 'recent'): string {
  const parts: string[] = [m.isChronic ? `${m.name} [慢箋]` : m.name]
  const dosing = [m.dose, m.frequency, m.route].filter(Boolean).join(', ')
  if (dosing) parts.push(`(${dosing})`)
  if (mode === 'active') {
    if (m.daysRemaining !== undefined && m.endDate) {
      parts.push(`— until ${m.endDate} (${m.daysRemaining}d left)`)
    } else if (m.startedOn) {
      parts.push(`— since ${m.startedOn}`)
    }
  } else {
    if (m.endDate) parts.push(`— ended ${m.endDate}`)
    else if (m.startedOn) parts.push(`— ${m.startedOn}`)
  }
  return parts.join(' ')
}

export function useMedicationsContext(
  includeMedications: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeMedications || !clinicalData?.medications?.length) return null

    let meds = clinicalData.medications

    // Apply chronic / acute filter
    const chronic = (filters?.medicationChronic as string) || 'all'
    if (chronic === 'chronic') {
      meds = meds.filter((m: any) => isChronicMedication(m))
    } else if (chronic === 'acute') {
      meds = meds.filter((m: any) => !isChronicMedication(m))
    }

    // Apply time-range filter on authoredOn
    const timeRange = (filters?.medicationTimeRange as string) || 'all'
    if (timeRange !== 'all') {
      meds = meds.filter((m: any) => isWithinTimeRangeDays(m.authoredOn, timeRange))
    }

    const summaries = meds.map((m: any) => summarize(m, audience, locale))

    const now = Date.now()
    const recentThreshold = now - RECENTLY_ENDED_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const active: MedSummary[] = []
    const recent: MedSummary[] = []
    const past: MedSummary[] = []

    for (const s of summaries) {
      if (!s.isInactive) {
        active.push(s)
      } else if (s.endDate && new Date(s.endDate).getTime() >= recentThreshold) {
        recent.push(s)
      } else {
        past.push(s)
      }
    }

    if (filters?.medicationStatus === 'active') {
      past.length = 0
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

    if (past.length > 0) {
      if (items.length > 0) items.push('')
      items.push(`Past medications: ${past.length} items older than ${RECENTLY_ENDED_WINDOW_DAYS} days (omitted for brevity)`)
    }

    if (items.length === 0) return null
    return { title: "Patient's Medications", items }
  }, [includeMedications, clinicalData, filters, audience, locale])
}
