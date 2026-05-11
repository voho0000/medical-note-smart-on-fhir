// LocalBundleService
// Stores a FHIR Bundle in localStorage and parses it into domain entities.
// When a bundle is present, query hooks use it instead of the live FHIR server.
// Encounter grouping: resources without encounter reference are matched by same-day date.

import { FhirMapper } from '../mappers/fhir.mapper'
import { PatientMapper } from '../mappers/patient.mapper'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

const STORAGE_KEY = 'fhir_bundle_override'

export interface LocalBundleData {
  patient: PatientEntity
  collection: ClinicalDataCollection
}

function toDateStr(dateStr?: string): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 10)
}

// Attach encounter references to resources that are missing them, based on same-day date.
// For MedicationRequest/Procedure/Condition we use the order/recorded date (same as encounter day).
// For DiagnosticReport/Observation we use effectiveDateTime (only matches if done same day).
function attachEncounterRefs(resources: any[], encounterDateMap: Map<string, string>): any[] {
  return resources.map((r) => {
    if (r.encounter?.reference) return r // already has a reference

    const dateFields: string[] = [
      r.authoredOn,           // MedicationRequest
      r.performedDateTime,    // Procedure
      r.performedPeriod?.start,
      r.recordedDate,         // Condition
      r.effectiveDateTime,    // Observation, DiagnosticReport
      r.period?.start,
    ]

    for (const d of dateFields) {
      const key = toDateStr(d)
      if (key && encounterDateMap.has(key)) {
        return { ...r, encounter: { reference: `Encounter/${encounterDateMap.get(key)}` } }
      }
    }

    return r
  })
}

export const LocalBundleService = {
  hasData(): boolean {
    if (typeof window === 'undefined') return false
    return !!localStorage.getItem(STORAGE_KEY)
  },

  save(bundle: object): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle))
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },

  load(): object | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  parse(bundle: any): LocalBundleData | null {
    const entries: any[] = bundle?.entry?.map((e: any) => e.resource).filter(Boolean) ?? []
    if (!entries.length) return null

    const byType = (type: string) => entries.filter((r) => r.resourceType === type)

    // Extract patient
    const patientRaw = byType('Patient')[0]
    if (!patientRaw) return null
    const patient = PatientMapper.toDomain(patientRaw)
    if (!patient) return null

    // Build encounter date map: { "YYYY-MM-DD" -> encounterId }
    // VGH data has one encounter per day per department; use first match if multiple same-day.
    const encounters = byType('Encounter')
    const encounterDateMap = new Map<string, string>()
    for (const enc of encounters) {
      const d = toDateStr(enc.period?.start)
      if (d && !encounterDateMap.has(d)) {
        encounterDateMap.set(d, enc.id)
      }
    }

    // Pre-process resources: attach encounter refs where missing
    const meds   = attachEncounterRefs(byType('MedicationRequest'), encounterDateMap)
    const obs    = attachEncounterRefs(byType('Observation'), encounterDateMap)
    const reports = byType('DiagnosticReport')
    const procs  = attachEncounterRefs(byType('Procedure'), encounterDateMap)
    const conds  = attachEncounterRefs(byType('Condition'), encounterDateMap)
    const allerg = byType('AllergyIntolerance')
    const docRefs = byType('DocumentReference')
    const comps  = byType('Composition')

    // Build observation map for DiagnosticReport expansion
    const allObs = obs.map((r: any) => FhirMapper.toObservation(r))
    const obsMap = new Map(allObs.map((o: any) => [o.id, o]))

    // Attach encounter refs to DiagnosticReports using same-day strategy
    const processedReports = attachEncounterRefs(reports, encounterDateMap).map((r: any) =>
      FhirMapper.toDiagnosticReport(r, allObs)
    )

    // Separate vital signs from other observations
    const observations = allObs
    const vitalSigns = allObs.filter((o: any) => {
      const cats = o.category ?? []
      return cats.some((c: any) => c.coding?.[0]?.code === 'vital-signs')
    })

    const collection: ClinicalDataCollection = {
      conditions:       conds.map((r: any) => FhirMapper.toCondition(r)),
      medications:      meds.map((r: any) => FhirMapper.toMedication(r)),
      allergies:        allerg.map((r: any) => FhirMapper.toAllergy(r)),
      observations,
      vitalSigns,
      diagnosticReports: processedReports,
      procedures:       procs.map((r: any) => FhirMapper.toProcedure(r)),
      encounters:       encounters.map((r: any) => FhirMapper.toEncounter(r)),
      documentReferences: docRefs.map((r: any) => FhirMapper.toDocumentReference(r)),
      compositions:     comps.map((r: any) => FhirMapper.toComposition(r)),
    }

    return { patient, collection }
  },

  parseStored(): LocalBundleData | null {
    const bundle = this.load()
    if (!bundle) return null
    return this.parse(bundle)
  },
}
