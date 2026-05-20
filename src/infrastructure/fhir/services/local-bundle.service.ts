// LocalBundleService
// Stores a FHIR Bundle in localStorage and parses it into domain entities.
// When a bundle is present, query hooks use it instead of the live FHIR server.
// Encounter grouping: resources without encounter reference are matched by same-day date.

import { FhirMapper } from '../mappers/fhir.mapper'
import { PatientMapper } from '../mappers/patient.mapper'
import { synthesizePharmacyEncounters } from '../utils/synthesize-pharmacy-encounters'
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

// Attach encounter references for non-medication resources by same-day match.
// Used by Observation / Procedure / Condition / DiagnosticReport — these
// don't carry a "requester / provider" field, so date alone is the best we
// have. Multi-encounter same-day collisions take the first match (existing
// VGH behaviour).
function attachEncounterRefsByDate(resources: any[], encounterDateMap: Map<string, string>): any[] {
  return resources.map((r) => {
    if (r.encounter?.reference) return r // already has a reference

    const dateFields: string[] = [
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

// Attach encounter references for MedicationRequests. REQUIRES provider
// match in addition to same-day match — otherwise pharmacy-only refills get
// silently merged into an unrelated same-day clinic visit (e.g. an ENT
// outpatient encounter ends up "containing" the patient's BPH chronic
// refills). Unmatched meds remain orphans here; synthesizePharmacyEncounters()
// downstream gives each orphan group its own synthetic 藥局 Encounter.
function attachEncounterRefsForMeds(
  meds: any[],
  encounterByDateProvider: Map<string, string>,
): any[] {
  return meds.map((m) => {
    if (m.encounter?.reference) return m
    const date = toDateStr(m.authoredOn || m.effectiveDateTime)
    const requester = m.requester?.display?.trim() || ''
    if (!date || !requester) return m
    const id = encounterByDateProvider.get(`${date}|${requester}`)
    if (!id) return m
    return { ...m, encounter: { reference: `Encounter/${id}` } }
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
    // Also build (date, provider) → encounterId so medication attachment can
    // disambiguate when multiple same-day encounters exist across providers
    // (e.g. ENT clinic + pharmacy refill on the same day).
    const encounterByDateProvider = new Map<string, string>()
    for (const enc of encounters) {
      const d = toDateStr(enc.period?.start)
      if (d && !encounterDateMap.has(d)) {
        encounterDateMap.set(d, enc.id)
      }
      const provider = enc.serviceProvider?.display?.trim() || ''
      if (d && provider && !encounterByDateProvider.has(`${d}|${provider}`)) {
        encounterByDateProvider.set(`${d}|${provider}`, enc.id)
      }
    }

    // Build Medication resource map for resolving medicationReference in
    // MedicationStatement (used by IPS / other document-type bundles).
    const medicationResources = byType('Medication')
    const medicationMap = new Map(medicationResources.map((m: any) => [m.id, m]))

    // Normalize MedicationStatements to a MedicationRequest-compatible shape so
    // the rest of the pipeline (FhirMapper, display components) can handle them
    // without needing to know which resource type they came from.
    const medicationStatements = byType('MedicationStatement').map((ms: any) => {
      // Resolve medicationReference → medicationCodeableConcept
      let resolved = ms
      if (!ms.medicationCodeableConcept && ms.medicationReference) {
        const ref: string = ms.medicationReference.reference ?? ''
        const refId = ref.startsWith('urn:uuid:')
          ? ref.replace('urn:uuid:', '')
          : ref.split('/').pop() ?? ''
        const medResource = refId ? medicationMap.get(refId) : null
        if (medResource?.code) {
          resolved = { ...ms, medicationCodeableConcept: medResource.code }
        }
      }
      // Normalize field names that differ between MedicationRequest and MedicationStatement
      return {
        ...resolved,
        authoredOn: resolved.authoredOn
          ?? resolved.effectivePeriod?.start
          ?? resolved.effectiveDateTime,
        dosageInstruction: resolved.dosageInstruction ?? resolved.dosage,
      }
    })

    // Pre-process resources: attach encounter refs where missing.
    // Medications use provider-aware matching (date + requester); everything
    // else falls back to date-only matching as before.
    const medsAttached = attachEncounterRefsForMeds(
      [...byType('MedicationRequest'), ...medicationStatements],
      encounterByDateProvider,
    )
    // For any meds still without an encounter ref, synthesise a "藥局"
    // Encounter per (date, requester) group so pharmacy refills surface as
    // their own visit in the visit-history view.
    const { encounters: encountersWithSynthetic, medications: meds } =
      synthesizePharmacyEncounters({ encounters, medications: medsAttached })

    const obs    = attachEncounterRefsByDate(byType('Observation'), encounterDateMap)
    const reports = byType('DiagnosticReport')
    const procs  = attachEncounterRefsByDate(byType('Procedure'), encounterDateMap)
    const conds  = attachEncounterRefsByDate(byType('Condition'), encounterDateMap)
    const allerg = byType('AllergyIntolerance')
    const docRefs = byType('DocumentReference')
    const comps  = byType('Composition')

    // Build observation map for DiagnosticReport expansion
    const allObs = obs.map((r: any) => FhirMapper.toObservation(r))
    const obsMap = new Map(allObs.map((o: any) => [o.id, o]))

    // Attach encounter refs to DiagnosticReports using same-day strategy
    const processedReports = attachEncounterRefsByDate(reports, encounterDateMap).map((r: any) =>
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
      encounters:       encountersWithSynthetic.map((r: any) => FhirMapper.toEncounter(r)),
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
