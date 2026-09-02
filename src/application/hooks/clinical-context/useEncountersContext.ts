// Encounters Context Hook
// Encounter-centric view of patient data. Each visit shows its diagnoses,
// medications, lab tests, and procedures together — matching how clinicians
// actually read charts (per-visit, not per-data-type).
//
// Includes a top-level "currently active medications" summary so the AI gets
// a quick view of what the patient is on right now without having to scan
// every visit.
import { useMemo, useState } from "react"
import type { ClinicalContextSection, DataFilters, TimeRange } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { buildIcdDictionary, extractEncounterIcds } from "@/src/shared/utils/icd-lookup"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickAiMedicationName, pickLocalizedText } from "@/src/shared/utils/fhir-display-helpers"
import {
  durationToDays,
  filterEncounterRecords,
  filterMedicationRecords,
  filterProcedureRecords,
} from "@/src/core/utils/clinical-context-selection.utils"
import { referenceId } from "@/src/core/utils/observation-selectors"
import { formatOrganizationDisplay } from "@/src/shared/utils/organization-display"
import {
  getEncounterKindCode,
  getEncounterKindText,
} from "@/src/shared/utils/encounter-type.utils"

const MAX_INPATIENT_FRAGMENT_GAP_MS = 7 * 24 * 60 * 60 * 1000

function refId(ref: any): string | undefined {
  return referenceId(ref?.reference)
}

function dateOnly(d: string | undefined): string | undefined {
  return d ? d.slice(0, 10) : undefined
}

function summarizeMedLine(
  m: any,
): string {
  const name = pickAiMedicationName(
    m.medicationCodeableConcept,
    m.medicationReference?.display,
  )
    || 'Unknown'
  const dosage = m.dosageInstruction?.[0]
  const dose = dosage?.doseAndRate?.[0]?.doseQuantity
    ? `${dosage.doseAndRate[0].doseQuantity.value} ${dosage.doseAndRate[0].doseQuantity.unit || ''}`.trim()
    : undefined
  const freq = dosage?.text
  const route = dosage?.route?.text || dosage?.route?.coding?.[0]?.display
  const days = durationToDays(m.dispenseRequest?.expectedSupplyDuration)
  const dosing = [dose, freq, route].filter(Boolean).join(', ')
  const dur = days ? ` × ${days}d` : ''
  return `${name}${dosing ? ` (${dosing})` : ''}${dur}`
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

function diagnosesFromEncounter(
  enc: any,
  dict: Map<string, string>,
  locale: string,
): { labels: string[]; key: string; primaryKey: string } {
  // Handles both new (one entry per diagnosis with English coding[].display)
  // and old (comma-separated codes in reasonCode[0].text) bridge formats.
  const diagnoses = extractEncounterIcds(enc, dict, locale)
  return {
    labels: diagnoses.map((rc) => rc.description ? `${rc.code} - ${rc.description}` : rc.code),
    key: [...new Set(diagnoses.map((rc) => rc.code.trim().toUpperCase()).filter(Boolean))]
      .sort()
      .join('|'),
    primaryKey: diagnoses[0]?.code.trim().toUpperCase() ?? '',
  }
}

function encounterInterval(encounter: any): { start: number; end: number } | null {
  const start = Date.parse(encounter?.period?.start ?? '')
  if (!Number.isFinite(start)) return null
  const parsedEnd = Date.parse(encounter?.period?.end ?? '')
  const end = Number.isFinite(parsedEnd) ? Math.max(start, parsedEnd) : start
  return { start, end }
}

function intervalsBelongToSameInpatientEpisode(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start <= right.end + MAX_INPATIENT_FRAGMENT_GAP_MS
    && right.start <= left.end + MAX_INPATIENT_FRAGMENT_GAP_MS
}

function inpatientEpisodeRange(visits: any[]): string {
  const starts = visits.map((visit) => dateOnly(visit?.period?.start)).filter(Boolean) as string[]
  const ends = visits.map((visit) =>
    dateOnly(visit?.period?.end) ?? dateOnly(visit?.period?.start),
  ).filter(Boolean) as string[]
  const start = starts.sort()[0]
  const end = ends.sort().at(-1)
  if (!start) return 'Unknown date'
  return end && end !== start ? `${start}–${end}` : start
}

function encounterCareType(encounter: any): 'outpatient' | 'inpatient' | 'emergency' | 'other' {
  const kind = String(getEncounterKindCode(encounter) ?? '').toLowerCase()
  const classCode = String(encounter?.class?.code ?? '').toLowerCase()
  if (['inpatient', 'imp', 'acute', 'ss', 'obsenc', 'prenc'].includes(kind)
      || ['imp', 'inpatient', 'acute', 'ss', 'obsenc', 'prenc'].includes(classCode)) {
    return 'inpatient'
  }
  if (['emergency', 'emer', 'ed'].includes(kind)
      || ['emer', 'emergency', 'ed'].includes(classCode)) {
    return 'emergency'
  }
  if (['outpatient', 'outpatient-or-emergency', 'amb', 'ambulatory', 'op'].includes(kind)
      || ['amb', 'ambulatory', 'outpatient', 'op'].includes(classCode)) {
    return 'outpatient'
  }
  return 'other'
}

function institutionIdentity(encounter: any, locale: string): { key: string; label: string } {
  const reference = String(encounter?.serviceProvider?.reference ?? '').trim()
  const rawDisplay = String(encounter?.serviceProvider?.display ?? '').trim()
  const label = rawDisplay ? formatOrganizationDisplay(rawDisplay, locale) : ''
  const fallbackKey = label.normalize('NFKC').toLowerCase()
  return { key: reference || fallbackKey, label }
}

export function useEncountersContext(
  includeEncounters: boolean,
  clinicalData: ClinicalData | null,
  timeRange: TimeRange = 'all',
  options?: {
    includeMedications?: boolean
    includeProcedures?: boolean
    filters?: Partial<DataFilters>
    nowMs?: number
  },
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  const [fallbackNowMs] = useState(Date.now)
  const nowMs = options?.nowMs ?? fallbackNowMs
  return useMemo(() => {
    if (!includeEncounters || !clinicalData) return null
    const encounters: any[] = (clinicalData as any).encounters ?? []
    if (encounters.length === 0) return null

    const conditions: any[] = (clinicalData.conditions as any[]) ?? []
    const includeMedications = options?.includeMedications ?? true
    const includeProcedures = options?.includeProcedures ?? true
    const medications: any[] = includeMedications
      ? filterMedicationRecords(
          (clinicalData.medications as any[]) ?? [],
          options?.filters,
          clinicalData as { encounters?: any[] },
          options?.nowMs ?? nowMs,
        )
      : []
    const procedures: any[] = includeProcedures
      ? filterProcedureRecords(
          (clinicalData.procedures as any[]) ?? [],
          options?.filters,
          clinicalData as { encounters?: any[] },
        )
      : []

    // ICD descriptions follow UI language only (medical professionals
    // reading in zh-TW UI still get 中文 ICD descriptions because they're
    // descriptive labels, not pharmacology identifiers).
    const icdDict = buildIcdDictionary(conditions, locale)

    // Build encounter → resources map. Lab/observation VALUES are intentionally
    // NOT collected per-visit — measurement-type data lives in its own
    // trend-oriented sections (Lab Reports / Vital Signs / Other Observations)
    // so the time-series isn't fragmented across visits and isn't duplicated.
    const encMap = new Map<string, {
      diagnoses: string[]
      diagnosisKey: string
      primaryDiagnosisKey: string
      meds: any[]
      procs: any[]
    }>()

    for (const enc of encounters) {
      const diagnoses = diagnosesFromEncounter(enc, icdDict, locale)
      encMap.set(enc.id, {
        diagnoses: diagnoses.labels,
        diagnosisKey: diagnoses.key,
        primaryDiagnosisKey: diagnoses.primaryKey,
        meds: [],
        procs: [],
      })
    }

    const push = (encId: string | undefined, key: 'meds' | 'procs', item: any) => {
      if (!encId) return
      const entry = encMap.get(encId)
      if (!entry) return
      entry[key].push(item)
    }

    medications.forEach((m) => push(refId(m.encounter), 'meds', m))
    procedures.forEach((p) => push(refId(p.encounter), 'procs', p))

    // Honour the selected visit window exactly. Undated encounters are retained
    // in all-time mode and labelled explicitly instead of disappearing.
    const visitsToShow = filterEncounterRecords(
      encounters,
      timeRange,
      clinicalData as { encounters?: any[] },
    )

    const orderedVisits = [...visitsToShow].sort((a, b) =>
      String(b?.period?.start ?? '').localeCompare(String(a?.period?.start ?? '')),
    )
    type EncounterGroup = {
      visits: any[]
      kind: 'single' | 'outpatient' | 'inpatient-episode'
      interval?: { start: number; end: number }
    }
    const groups: EncounterGroup[] = []
    const outpatientGroups = new Map<string, EncounterGroup>()
    const inpatientGroups = new Map<string, EncounterGroup[]>()
    for (const encounter of orderedVisits) {
      const entry = encMap.get(encounter.id)
      const institution = institutionIdentity(encounter, locale)
      const careType = encounterCareType(encounter)
      const outpatientGroupable = careType === 'outpatient'
        && !!institution.key
        && !!entry?.diagnosisKey
      const typeKey = String(
        getEncounterKindCode(encounter) ?? encounter?.class?.code ?? 'outpatient',
      ).toLowerCase()
      const outpatientKey = outpatientGroupable
        ? `${institution.key}\u0000${typeKey}\u0000${entry!.diagnosisKey}`
        : ''
      const existingOutpatient = outpatientKey
        ? outpatientGroups.get(outpatientKey)
        : undefined
      if (existingOutpatient) {
        existingOutpatient.visits.push(encounter)
        continue
      }
      if (outpatientKey) {
        const group: EncounterGroup = { visits: [encounter], kind: 'outpatient' }
        groups.push(group)
        outpatientGroups.set(outpatientKey, group)
        continue
      }

      // Older MediCloud imports could materialize one hospitalization as many
      // Encounter records (often one per claim/report date). Merge only records
      // with the same institution and primary ICD when the claim fragments
      // overlap or fall within the same short admission window. A seven-day
      // bridge covers sparse daily claim rows such as 12/19, 12/24, and 12/29,
      // while recurring treatment stays several weeks apart remain distinct.
      const interval = encounterInterval(encounter)
      const inpatientKey = careType === 'inpatient'
        && !!institution.key
        && !!entry?.primaryDiagnosisKey
        && interval
        ? `${institution.key}\u0000${entry.primaryDiagnosisKey}`
        : ''
      const episode = inpatientKey
        ? (inpatientGroups.get(inpatientKey) ?? []).find((candidate) =>
            !!candidate.interval
              && intervalsBelongToSameInpatientEpisode(candidate.interval, interval!),
          )
        : undefined
      if (episode && interval) {
        episode.visits.push(encounter)
        episode.interval = {
          start: Math.min(episode.interval!.start, interval.start),
          end: Math.max(episode.interval!.end, interval.end),
        }
        continue
      }
      const group: EncounterGroup = {
        visits: [encounter],
        kind: inpatientKey ? 'inpatient-episode' : 'single',
        ...(interval ? { interval } : {}),
      }
      groups.push(group)
      if (inpatientKey) {
        const episodes = inpatientGroups.get(inpatientKey)
        if (episodes) episodes.push(group)
        else inpatientGroups.set(inpatientKey, [group])
      }
    }

    const encounterLines = (encounter: any, includeHeader: boolean): string[] => {
      const date = dateOnly(encounter.period?.start) || 'Unknown date'
      const endDate = dateOnly(encounter.period?.end)
      const dateLabel = encounterCareType(encounter) === 'inpatient'
        && endDate
        && endDate !== date
        ? `${date}–${endDate}`
        : date
      const dept = getEncounterKindText(encounter)
        || encounter.type?.[0]?.coding?.[0]?.display
        || encounter.type?.[0]?.text
        || encounter.serviceType?.text
        || ''
      const physician = encounter.participant?.[0]?.individual?.display
        || encounter.participant?.[0]?.actor?.display
        || ''
      const classText = encounter.class?.display || encounter.class?.code || ''
      const lines: string[] = []
      if (includeHeader) {
        const institution = institutionIdentity(encounter, locale).label
        const header = [dateLabel, institution, dept, physician ? `Dr. ${physician}` : '', classText]
          .filter(Boolean)
          .join(' · ')
        lines.push(`▶ ${header}`)
      }
      const entry = encMap.get(encounter.id)
      if (entry?.diagnoses.length && includeHeader) {
        lines.push(`  ICD: ${entry.diagnoses.join('; ')}`)
      }
      if (physician && !includeHeader) {
        lines.push(`  Physician: Dr. ${physician}`)
      }
      if (entry?.meds.length) {
        lines.push('  Medications:')
        entry.meds.forEach((medication) => lines.push(`  • ${summarizeMedLine(medication)}`))
      }
      if (entry?.procs.length) {
        lines.push('  Procedures:')
        entry.procs.forEach((procedure) => lines.push(`  • ${summarizeProcLine(procedure, audience, locale)}`))
      }
      return lines
    }

    const items: string[] = []
    items.push(`Recent visits (showing ${visitsToShow.length} of ${encounters.length}):`)
    items.push("Note: ICD codes are billing codes recorded for visits, not confirmed diagnoses. See 'Problem List' for clinically confirmed diagnoses. 'Patient's Medications' is the authoritative regimen list; visit-linked medications and procedures are chronology only and may repeat standalone sections; do not double-count them.")

    for (const group of groups) {
      if (group.visits.length === 1) {
        items.push(encounterLines(group.visits[0], true).join('\n'))
        continue
      }

      const representative = group.visits[0]
      const institution = institutionIdentity(representative, locale).label
      const dept = getEncounterKindText(representative)
        || representative.type?.[0]?.coding?.[0]?.display
        || representative.type?.[0]?.text
        || representative.serviceType?.text
        || 'outpatient'
      const classText = representative.class?.display || representative.class?.code || ''
      const isInpatientEpisode = group.kind === 'inpatient-episode'
      const header = [
        ...(isInpatientEpisode ? [inpatientEpisodeRange(group.visits)] : []),
        institution,
        dept,
        classText,
      ].filter(Boolean).join(' · ')
      const diagnoses = [...new Set(group.visits.flatMap((visit) =>
        encMap.get(visit.id)?.diagnoses ?? [],
      ))]
      const lines = [`▶ ${header}`, `  ICD: ${diagnoses.join('; ')}`]
      if (isInpatientEpisode) {
        lines.push(`  Source records: ${group.visits.length} (merged as one inpatient episode)`)
      } else {
        const dates = group.visits.map((encounter) =>
          dateOnly(encounter.period?.start) || 'Unknown date',
        )
        lines.push(`  Dates: ${dates.join(', ')}`, `  Total: ${group.visits.length} visits`)
      }
      const visitDetails = group.visits.flatMap((encounter) => {
        const details = encounterLines(encounter, false)
        if (details.length === 0) return []
        return [`  ${dateOnly(encounter.period?.start) || 'Unknown date'}:`, ...details.map((line) => `  ${line}`)]
      })
      if (visitDetails.length > 0) {
        lines.push('  Visit-specific details:', ...visitDetails)
      }
      items.push(lines.join('\n'))
    }

    return { title: 'Visits & Treatment History', items }
  }, [includeEncounters, clinicalData, timeRange, audience, locale, options, nowMs])
}
