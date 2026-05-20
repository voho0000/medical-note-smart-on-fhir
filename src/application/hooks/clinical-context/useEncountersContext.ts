// Encounters Context Hook
// Encounter-centric view of patient data. Each visit shows its diagnoses,
// medications, lab tests, and procedures together — matching how clinicians
// actually read charts (per-visit, not per-data-type).
//
// Includes a top-level "currently active medications" summary so the AI gets
// a quick view of what the patient is on right now without having to scan
// every visit.
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { buildIcdDictionary, extractEncounterIcds } from "@/src/shared/utils/icd-lookup"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/features/clinical-summary/medications/utils/fhir-helpers"

const MAX_VISITS = 10
const RECENT_DAYS = 365

function toDays(d: any): number | undefined {
  const v = Number(d?.value)
  if (!Number.isFinite(v) || v <= 0) return undefined
  const u = String(d?.unit || d?.code || '').toLowerCase()
  const f =
    u.startsWith('d') ? 1 :
    u.startsWith('w') ? 7 :
    u.startsWith('mo') ? 30 :
    u.startsWith('y') || u === 'a' ? 365 :
    1
  return Math.round(v * f)
}

function refId(ref: any): string | undefined {
  const r = ref?.reference
  if (!r) return undefined
  return r.includes('/') ? r.split('/').pop() : r
}

function dateOnly(d: string | undefined): string | undefined {
  return d ? d.slice(0, 10) : undefined
}

function summarizeMedLine(
  m: any,
  audience: 'medical' | 'patient',
  locale: string,
): string {
  const name = pickLocalizedText(m.medicationCodeableConcept, audience, locale)
    || m.medicationCodeableConcept?.text
    || m.medicationCodeableConcept?.coding?.[0]?.display
    || 'Unknown'
  const dosage = m.dosageInstruction?.[0]
  const dose = dosage?.doseAndRate?.[0]?.doseQuantity
    ? `${dosage.doseAndRate[0].doseQuantity.value} ${dosage.doseAndRate[0].doseQuantity.unit || ''}`.trim()
    : undefined
  const freq = dosage?.text
  const route = dosage?.route?.text || dosage?.route?.coding?.[0]?.display
  const days = toDays(m.dispenseRequest?.expectedSupplyDuration)
  const dosing = [dose, freq, route].filter(Boolean).join(', ')
  const dur = days ? ` × ${days}d` : ''
  return `${name}${dosing ? ` (${dosing})` : ''}${dur}`
}

function summarizeObsLine(
  o: any,
  audience: 'medical' | 'patient',
  locale: string,
): string {
  const title = pickLocalizedText(o.code, audience, locale)
    || o.code?.text
    || o.code?.coding?.[0]?.display
    || 'Observation'
  let value = '—'
  if (o.valueQuantity?.value !== undefined) {
    value = `${o.valueQuantity.value}${o.valueQuantity.unit ? ' ' + o.valueQuantity.unit : ''}`
  } else if (o.valueString) {
    value = o.valueString
  } else if (Array.isArray(o.component) && o.component.length > 0) {
    value = o.component.map((c: any) => {
      const t = pickLocalizedText(c.code, audience, locale) || c.code?.text || c.code?.coding?.[0]?.display || 'comp'
      const v = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}`.trim() : (c.valueString || '—')
      return `${t} ${v}`
    }).join(', ')
  }
  const interp = o.interpretation?.coding?.[0]?.code || o.interpretation?.text
  return `${title}: ${value}${interp ? ` [${interp}]` : ''}`
}

function summarizeProcLine(
  p: any,
  audience: 'medical' | 'patient',
  locale: string,
): string {
  const title = pickLocalizedText(p.code, audience, locale)
    || p.code?.text
    || p.code?.coding?.[0]?.display
    || 'Procedure'
  return title
}

function diagnosesFromEncounter(enc: any, dict: Map<string, string>, locale: string): string[] {
  // Handles both new (one entry per diagnosis with English coding[].display)
  // and old (comma-separated codes in reasonCode[0].text) bridge formats.
  return extractEncounterIcds(enc, dict, locale).map((rc) =>
    rc.description ? `${rc.code} - ${rc.description}` : rc.code
  )
}

interface ActiveMed {
  name: string
  endDate: string
  daysRemaining: number
}

function getCurrentlyActiveMeds(
  meds: any[],
  audience: 'medical' | 'patient',
  locale: string,
): ActiveMed[] {
  const out: ActiveMed[] = []
  for (const m of meds) {
    const status = String(m.status || '').toLowerCase()
    if (status === 'stopped' || status === 'completed' || status === 'cancelled') continue
    const startedRaw = m.authoredOn || m.effectiveDateTime
    const days = toDays(m.dispenseRequest?.expectedSupplyDuration)
    if (!startedRaw || !days) continue
    const start = new Date(startedRaw)
    if (Number.isNaN(start.getTime())) continue
    const end = new Date(start)
    end.setDate(end.getDate() + days)
    const daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysRemaining < 0) continue
    const name = pickLocalizedText(m.medicationCodeableConcept, audience, locale)
      || m.medicationCodeableConcept?.text
      || m.medicationCodeableConcept?.coding?.[0]?.display
      || 'Unknown'
    out.push({ name, endDate: end.toISOString().slice(0, 10), daysRemaining })
  }
  return out.sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export function useEncountersContext(
  includeEncounters: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeEncounters || !clinicalData) return null
    const encounters: any[] = (clinicalData as any).encounters ?? []
    if (encounters.length === 0) return null

    const conditions: any[] = (clinicalData.conditions as any[]) ?? []
    const medications: any[] = (clinicalData.medications as any[]) ?? []
    const observations: any[] = (clinicalData.observations as any[]) ?? []
    const diagnosticReports: any[] = (clinicalData.diagnosticReports as any[]) ?? []
    const procedures: any[] = (clinicalData.procedures as any[]) ?? []

    // ICD descriptions follow UI language only (medical professionals
    // reading in zh-TW UI still get 中文 ICD descriptions because they're
    // descriptive labels, not pharmacology identifiers).
    const icdDict = buildIcdDictionary(conditions, locale)

    // Build encounter → resources map
    const encMap = new Map<string, {
      diagnoses: string[]
      meds: any[]
      tests: any[]
      procs: any[]
    }>()

    for (const enc of encounters) {
      encMap.set(enc.id, { diagnoses: diagnosesFromEncounter(enc, icdDict, locale), meds: [], tests: [], procs: [] })
    }

    const push = (encId: string | undefined, key: 'meds' | 'tests' | 'procs', item: any) => {
      if (!encId) return
      const entry = encMap.get(encId)
      if (!entry) return
      entry[key].push(item)
    }

    medications.forEach((m) => push(refId(m.encounter), 'meds', m))
    observations.forEach((o) => push(refId(o.encounter), 'tests', o))
    // For diagnostic reports, expand _observations if available
    diagnosticReports.forEach((r) => {
      const encId = refId(r.encounter)
      const obs = Array.isArray(r._observations) ? r._observations : []
      if (obs.length > 0) {
        obs.forEach((o: any) => push(encId, 'tests', o))
      } else if (r.code?.text || r.code?.coding?.[0]?.display) {
        push(encId, 'tests', r)
      }
    })
    procedures.forEach((p) => push(refId(p.encounter), 'procs', p))

    // Sort encounters by date desc
    const sorted = [...encounters]
      .filter((e) => e.period?.start)
      .sort((a, b) => (b.period?.start || '').localeCompare(a.period?.start || ''))

    const recentCutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
    const recent = sorted.filter((e) => {
      const t = new Date(e.period.start).getTime()
      return Number.isFinite(t) && t >= recentCutoff
    })
    const visitsToShow = (recent.length > 0 ? recent : sorted).slice(0, MAX_VISITS)
    const omittedCount = sorted.length - visitsToShow.length

    const items: string[] = []

    // Top-level summary: currently active medications across all visits
    const activeMeds = getCurrentlyActiveMeds(medications, audience, locale)
    if (activeMeds.length > 0) {
      items.push(`Currently active medications (${activeMeds.length}):`)
      activeMeds.slice(0, 15).forEach((m) => {
        items.push(`  • ${m.name} — until ${m.endDate} (${m.daysRemaining}d left)`)
      })
      if (activeMeds.length > 15) {
        items.push(`  …and ${activeMeds.length - 15} more`)
      }
      items.push('')
    }

    // Per-visit details
    items.push(`Recent visits (showing ${visitsToShow.length} of ${sorted.length}):`)
    items.push("Note: ICD codes listed under each visit come from billing/dispensing records and may not represent confirmed diagnoses. See 'Patient's Conditions' for clinically confirmed diagnoses.")
    items.push('')

    for (const enc of visitsToShow) {
      const date = dateOnly(enc.period?.start) || ''
      const dept = enc.type?.[0]?.coding?.[0]?.display || enc.type?.[0]?.text || enc.serviceType?.text || ''
      const physician = enc.participant?.[0]?.individual?.display || enc.participant?.[0]?.actor?.display || ''
      const classText = enc.class?.display || enc.class?.code || ''

      const header = [date, dept, physician ? `Dr. ${physician}` : '', classText]
        .filter(Boolean)
        .join(' · ')
      items.push(`▶ ${header}`)

      const entry = encMap.get(enc.id)
      if (entry?.diagnoses.length) {
        items.push(`    ICD codes on visit record (billing, not confirmed diagnoses): ${entry.diagnoses.join('; ')}`)
      }
      if (entry?.meds.length) {
        items.push(`    Medications:`)
        entry.meds.forEach((m) => items.push(`      • ${summarizeMedLine(m, audience, locale)}`))
      }
      if (entry?.tests.length) {
        items.push(`    Tests:`)
        entry.tests.forEach((o) => items.push(`      • ${summarizeObsLine(o, audience, locale)}`))
      }
      if (entry?.procs.length) {
        items.push(`    Procedures:`)
        entry.procs.forEach((p) => items.push(`      • ${summarizeProcLine(p, audience, locale)}`))
      }
      items.push('')
    }

    if (omittedCount > 0) {
      items.push(`(${omittedCount} earlier visits omitted for brevity)`)
    }

    return { title: 'Visits & Treatment History', items }
  }, [includeEncounters, clinicalData, audience, locale])
}
