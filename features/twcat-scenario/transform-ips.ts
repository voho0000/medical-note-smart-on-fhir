// FHIRfox scenario → FHIR R4 document Bundle.
//
// Direct port of /Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/fhir-resource-to-bundle/index.js
// with two important changes for Track #4 IPS Validator pass:
//
//   1. flavor='ips' (default) emits Composition with the IPS Universal
//      profile (Composition-uv-ips), type 60591-5 (Patient summary
//      Document), title "International Patient Summary", and required IPS
//      sections (Problem List, Medications, Allergies) — even when empty,
//      using `emptyReason` from the standard list-empty-reason CodeSystem.
//      flavor='twcore' preserves the original Consult-note shape.
//
//   2. Section LOINC codes follow the IPS IG (Problem List / Medications /
//      Allergies / Vitals / Results / Procedures). Section titles use IPS
//      conventions when flavor='ips'.
//
// Per-resource meta.profile stays TWCore because the conference scenarios
// are written against TWCore terminology bindings. Promoting per-resource
// profiles to IPS would require rewriting code bindings (RxNorm, ICD-10
// → SNOMED) — a far larger change. The dual-claim approach (TWCore
// per-resource, IPS at Composition) lets the IPS validator focus on
// document structure while TWCore handles the value bindings.

import type {
  BundleEntry,
  DocumentBundle,
  FhirfoxSessionPayload,
  FhirResource,
  ScenarioAllergy,
  ScenarioCondition,
  ScenarioDiagnosticReport,
  ScenarioEncounter,
  ScenarioMedication,
  ScenarioMedicationRequest,
  ScenarioObservation,
  ScenarioOrganization,
  ScenarioPatient,
  ScenarioPractitioner,
  ScenarioPractitionerRole,
  ScenarioProcedure,
  ScenarioResources,
  TransformOptions,
} from './types'

// ---------------------------------------------------------------------------
// Profiles + system constants
// ---------------------------------------------------------------------------

const TWCORE = 'https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition'
const IPS = 'http://hl7.org/fhir/uv/ips/StructureDefinition'

const PROFILE = {
  // TWCore — used per-resource (terminology fits scenario bindings).
  Patient: `${TWCORE}/Patient-twcore`,
  Organization: `${TWCORE}/Organization-twcore`,
  Encounter: `${TWCORE}/Encounter-twcore`,
  Practitioner: `${TWCORE}/Practitioner-twcore`,
  PractitionerRole: `${TWCORE}/PractitionerRole-twcore`,
  Condition: `${TWCORE}/Condition-twcore`,
  AllergyIntolerance: `${TWCORE}/AllergyIntolerance-twcore`,
  ObservationVitalSigns: `${TWCORE}/Observation-vital-signs-twcore`,
  ObservationLab: `${TWCORE}/Observation-laboratory-twcore`,
  Procedure: `${TWCORE}/Procedure-twcore`,
  DiagnosticReport: `${TWCORE}/DiagnosticReport-twcore`,
  MedicationRequest: `${TWCORE}/MedicationRequest-twcore`,
  Medication: `${TWCORE}/Medication-twcore`,
  // Composition profile depends on flavor — IPS for Track #4.
  CompositionTwcore: `${TWCORE}/Composition-twcore`,
  CompositionIps: `${IPS}/Composition-uv-ips`,
  BundleIps: `${IPS}/Bundle-uv-ips`,
}

const SYSTEM = {
  ucum: 'http://unitsofmeasure.org',
  loinc: 'http://loinc.org',
  snomed: 'http://snomed.info/sct',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  partType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  orgType: 'http://terminology.hl7.org/CodeSystem/organization-type',
  condClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  condVerStatus: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  condCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  diagnosisRole: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerStatus: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  admitSource: 'http://terminology.hl7.org/CodeSystem/admit-source',
  dischargeDisposition: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  diagReportCategory: 'http://terminology.hl7.org/CodeSystem/v2-0074',
  perfFunction: 'http://terminology.hl7.org/CodeSystem/performer-function',
  v2_0203: 'http://terminology.hl7.org/CodeSystem/v2-0203',
  twNationalId: 'http://www.moi.gov.tw',
  // IPS-specific CodeSystem for the canonical "no known allergies / problems
  // / medications" codes. Generic THO list-empty-reason (nilknown / withheld
  // / etc) doesn't include the IPS-blessed semantic codes — verified via the
  // IPS IG CodeSystem-absent-unknown-uv-ips.json definition. Using the wrong
  // system trips HAPI's code-invalid error.
  ipsAbsentUnknown: 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips',
}

// IPS-prescribed LOINC codes for each section.
//
// `title` is the human-facing label we set on section.title — free text,
// validator doesn't validate it strictly.
//
// We deliberately DO NOT set `section.code.coding[].display`. HAPI's
// terminology service validates display against LOINC's official en-US
// label and rejects with "Wrong Display Name" if you pick anything other
// than one of the (often awkward) LOINC long names like "Problem list -
// Reported". Omitting display is valid FHIR and sidesteps that whole
// failure class.
const IPS_SECTION = {
  problemList: { code: '11450-4', title: 'Problem List' },
  medications: { code: '10160-0', title: 'History of Medication use' },
  allergies: { code: '48765-2', title: 'Allergies and Intolerances' },
  vitalSigns: { code: '8716-3', title: 'Vital Signs' },
  results: { code: '30954-2', title: 'Results' },
  procedures: { code: '47519-4', title: 'History of Procedures' },
  // Non-IPS but allowed as additional sections — kept for Track #4 where
  // step 140 requires preserving encounter / diagnostic-report content.
  encounter: { code: '46240-8', title: 'History of Encounters' },
  diagnosticReports: { code: '11502-2', title: 'Laboratory Reports' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Both kebab-case singular (API) and camelCase plural (legacy) are tolerated.
function pickList<T>(input: ScenarioResources, ...keys: (keyof ScenarioResources)[]): T[] {
  for (const k of keys) {
    const v = input[k]
    if (Array.isArray(v)) return v as unknown as T[]
  }
  return []
}

function randomUuid(): string {
  // Browser & Node 19+ both expose crypto.randomUUID. The smart/twcat page is
  // "use client" so window.crypto exists at call time; the Node-side build
  // wrapper (download.js) also has crypto available.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older runtimes — fine for connectathon use, not crypto-safe.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface RefMap {
  assign: (type: string, id: string) => string
  get: (type: string, id: string) => string | undefined
}

function createRefMap(): RefMap {
  const map = new Map<string, string>()
  const key = (type: string, id: string) => `${type}/${id}`
  return {
    assign(type, id) {
      const k = key(type, id)
      if (!map.has(k)) map.set(k, `urn:uuid:${randomUuid()}`)
      return map.get(k) as string
    },
    get(type, id) {
      return map.get(key(type, id))
    },
  }
}

function ref(refs: RefMap, type: string, id: string | undefined): { reference: string } | undefined {
  if (id === undefined || id === null || id === '') return undefined
  const url = refs.get(type, String(id))
  return url ? { reference: url } : undefined
}

function quantity(value: number | undefined, unit: string | undefined) {
  if (value === undefined || value === null) return undefined
  return { value, unit, system: SYSTEM.ucum, code: unit }
}

// ---------------------------------------------------------------------------
// Resource builders — verbatim port of index.js with TypeScript types.
// ---------------------------------------------------------------------------

function buildPatient(p: ScenarioPatient, refs: RefMap): FhirResource {
  const identifiers: Array<Record<string, unknown>> = []
  if (p.id !== undefined && p.id !== null && p.id !== '') {
    identifiers.push({
      use: 'official',
      type: { coding: [{ system: SYSTEM.v2_0203, code: 'MR' }] },
      system: p.idSystem,
      value: String(p.id),
    })
  }
  if (p.idNumber) {
    identifiers.push({
      use: 'official',
      type: { coding: [{ system: SYSTEM.v2_0203, code: 'NI' }] },
      system: SYSTEM.twNationalId,
      value: p.idNumber,
    })
  }
  return {
    resourceType: 'Patient',
    id: p.id,
    meta: { profile: [PROFILE.Patient] },
    identifier: identifiers.length ? identifiers : undefined,
    active: p.active,
    name: p.name ? [{ use: 'official', text: p.name }] : undefined,
    telecom: p.telecomValue
      ? [{ system: p.telecomSystem, use: p.telecomUse, value: p.telecomValue }]
      : undefined,
    gender: p.gender,
    birthDate: p.birthDate,
    address: p.address ? [{ text: p.address }] : undefined,
    managingOrganization: p.organization ? ref(refs, 'Organization', p.organization) : undefined,
  }
}

function buildOrganization(o: ScenarioOrganization): FhirResource {
  return {
    resourceType: 'Organization',
    id: o.id,
    meta: { profile: [PROFILE.Organization] },
    identifier: o.identifierValue ? [{ system: o.idSystem, value: o.identifierValue }] : undefined,
    active: o.active,
    type: o.type ? [{ coding: [{ system: SYSTEM.orgType, code: o.type }] }] : undefined,
    name: o.name,
    telecom: o.telecomValue
      ? [{ system: o.telecomSystem, use: o.telecomUse, value: o.telecomValue }]
      : undefined,
    address: o.address ? [{ text: o.address }] : undefined,
  }
}

function buildEncounter(e: ScenarioEncounter, refs: RefMap): FhirResource {
  const hospitalization =
    e.admitSource || e.dischargeDisposition
      ? {
          admitSource: e.admitSource
            ? { coding: [{ system: SYSTEM.admitSource, code: e.admitSource }] }
            : undefined,
          dischargeDisposition: e.dischargeDisposition
            ? { coding: [{ system: SYSTEM.dischargeDisposition, code: e.dischargeDisposition }] }
            : undefined,
        }
      : undefined
  return {
    resourceType: 'Encounter',
    id: e.id,
    meta: { profile: [PROFILE.Encounter] },
    identifier: e.idSystem ? [{ system: e.idSystem, value: e.id }] : undefined,
    status: e.status,
    class: e.class ? { system: SYSTEM.actCode, code: e.class } : undefined,
    type: e.type ? [{ coding: [{ code: e.type }] }] : undefined,
    serviceType: e.serviceType
      ? { coding: [{ code: e.serviceType, display: e.serviceTypeText }] }
      : undefined,
    subject: ref(refs, 'Patient', e.patientId),
    participant: e.practitionerId
      ? [
          {
            type: e.participantType
              ? [{ coding: [{ system: SYSTEM.partType, code: e.participantType }] }]
              : undefined,
            individual: ref(refs, 'Practitioner', e.practitionerId),
          },
        ]
      : undefined,
    period: e.periodStart || e.periodEnd ? { start: e.periodStart, end: e.periodEnd } : undefined,
    reasonCode: e.reasonCode ? [{ coding: [{ code: e.reasonCode }] }] : undefined,
    diagnosis: e.conditionId
      ? [
          {
            condition: ref(refs, 'Condition', e.conditionId),
            use: e.diagnosisUse
              ? { coding: [{ system: SYSTEM.diagnosisRole, code: e.diagnosisUse }] }
              : undefined,
          },
        ]
      : undefined,
    hospitalization,
    serviceProvider: e.serviceProviderId
      ? ref(refs, 'Organization', e.serviceProviderId)
      : undefined,
  }
}

function buildPractitioner(p: ScenarioPractitioner, refs: RefMap): FhirResource {
  return {
    resourceType: 'Practitioner',
    id: p.id,
    meta: { profile: [PROFILE.Practitioner] },
    identifier: p.medicalLicenseNumber
      ? [{ system: p.medicalLicenseSystem, value: p.medicalLicenseNumber }]
      : undefined,
    active: p.active,
    name: p.name ? [{ use: 'official', text: p.name }] : undefined,
    telecom: p.telecomValue
      ? [{ system: p.telecomSystem, use: p.telecomUse, value: p.telecomValue }]
      : undefined,
    address: p.address ? [{ text: p.address }] : undefined,
    gender: p.gender,
    birthDate: p.birthday,
    qualification: p.qualificationCode
      ? [
          {
            code: { coding: [{ code: p.qualificationCode }] },
            issuer: p.qualificationIssuer
              ? ref(refs, 'Organization', p.qualificationIssuer)
              : undefined,
          },
        ]
      : undefined,
  }
}

function buildPractitionerRole(pr: ScenarioPractitionerRole, refs: RefMap): FhirResource {
  return {
    resourceType: 'PractitionerRole',
    id: pr.id,
    meta: { profile: [PROFILE.PractitionerRole] },
    identifier: pr.identifierValue ? [{ system: pr.idSystem, value: pr.identifierValue }] : undefined,
    active: pr.active,
    period: pr.periodStart || pr.periodEnd ? { start: pr.periodStart, end: pr.periodEnd } : undefined,
    practitioner: ref(refs, 'Practitioner', pr.practitionerId),
    organization: ref(refs, 'Organization', pr.organizationId),
    code: pr.roleCode ? [{ coding: [{ code: pr.roleCode, display: pr.roleText }] }] : undefined,
    specialty: pr.specialtyCode ? [{ coding: [{ code: pr.specialtyCode }] }] : undefined,
    telecom: pr.telecomValue
      ? [{ system: pr.telecomSystem, use: pr.telecomUse, value: pr.telecomValue }]
      : undefined,
  }
}

function buildCondition(c: ScenarioCondition, refs: RefMap): FhirResource {
  return {
    resourceType: 'Condition',
    id: c.id,
    meta: { profile: [PROFILE.Condition] },
    clinicalStatus: c.clinicalStatus
      ? { coding: [{ system: SYSTEM.condClinical, code: c.clinicalStatus }] }
      : undefined,
    verificationStatus: c.verificationStatus
      ? { coding: [{ system: SYSTEM.condVerStatus, code: c.verificationStatus }] }
      : undefined,
    category: c.category
      ? [{ coding: [{ system: SYSTEM.condCategory, code: c.category }] }]
      : undefined,
    severity: c.severity ? { coding: [{ system: SYSTEM.snomed, code: c.severity }] } : undefined,
    code: c.conditionCode
      ? { coding: [{ code: c.conditionCode, display: c.conditionText }] }
      : undefined,
    subject: ref(refs, 'Patient', c.patientId),
    encounter: c.encounterId ? ref(refs, 'Encounter', c.encounterId) : undefined,
    onsetDateTime: c.onsetDate,
    recorder: c.recorderId ? ref(refs, 'Practitioner', c.recorderId) : undefined,
    asserter: c.asserterId ? ref(refs, 'Practitioner', c.asserterId) : undefined,
    note: c.note ? [{ text: c.note }] : undefined,
  }
}

function buildAllergyIntolerance(a: ScenarioAllergy, refs: RefMap): FhirResource {
  const reaction =
    a.manifestation || a.reactionSubstance || a.severity || a.exposureRoute || a.reactionDescription
      ? [
          {
            substance: a.reactionSubstance
              ? { coding: [{ system: SYSTEM.snomed, code: a.reactionSubstance }] }
              : undefined,
            manifestation: a.manifestation
              ? [{ coding: [{ system: SYSTEM.snomed, code: a.manifestation }] }]
              : undefined,
            description: a.reactionDescription,
            severity: a.severity,
            exposureRoute: a.exposureRoute
              ? { coding: [{ system: SYSTEM.snomed, code: a.exposureRoute }] }
              : undefined,
          },
        ]
      : undefined
  return {
    resourceType: 'AllergyIntolerance',
    id: a.id,
    meta: { profile: [PROFILE.AllergyIntolerance] },
    clinicalStatus: a.clinicalStatus
      ? { coding: [{ system: SYSTEM.allergyClinical, code: a.clinicalStatus }] }
      : undefined,
    verificationStatus: a.verificationStatus
      ? { coding: [{ system: SYSTEM.allergyVerStatus, code: a.verificationStatus }] }
      : undefined,
    type: a.type,
    category: a.category ? [a.category] : undefined,
    criticality: a.criticality,
    code: a.allergyCode ? { coding: [{ code: a.allergyCode }] } : undefined,
    patient: ref(refs, 'Patient', a.patientId),
    encounter: a.encounterId ? ref(refs, 'Encounter', a.encounterId) : undefined,
    onsetDateTime: a.onsetDate,
    recordedDate: a.recordedDate,
    recorder: a.recorderId ? ref(refs, 'Practitioner', a.recorderId) : undefined,
    asserter: a.asserterId ? ref(refs, 'Practitioner', a.asserterId) : undefined,
    lastOccurrence: a.lastOccurrence,
    note: a.note ? [{ text: a.note }] : undefined,
    reaction,
  }
}

function buildObservation(
  o: ScenarioObservation,
  refs: RefMap,
  kind: 'vital' | 'lab',
): FhirResource {
  const profile = kind === 'lab' ? PROFILE.ObservationLab : PROFILE.ObservationVitalSigns
  const obs: FhirResource = {
    resourceType: 'Observation',
    id: o.id,
    meta: { profile: [profile] },
    status: o.status,
    category: o.categoryCode
      ? [{ coding: [{ system: SYSTEM.obsCategory, code: o.categoryCode }] }]
      : undefined,
    code: o.observationCode ? { coding: [{ code: o.observationCode }] } : undefined,
    subject: ref(refs, 'Patient', o.patientId),
    encounter: o.encounterId ? ref(refs, 'Encounter', o.encounterId) : undefined,
    effectiveDateTime: o.effectiveDate,
    performer: o.performerId
      ? [ref(refs, 'Practitioner', o.performerId)].filter(Boolean)
      : undefined,
  }

  if (o.systolicValue !== undefined || o.diastolicValue !== undefined) {
    obs.component = [
      o.systolicValue !== undefined && {
        code: {
          coding: [{ system: SYSTEM.loinc, code: '8480-6', display: 'Systolic blood pressure' }],
        },
        valueQuantity: quantity(o.systolicValue, o.systolicUnit),
      },
      o.diastolicValue !== undefined && {
        code: {
          coding: [{ system: SYSTEM.loinc, code: '8462-4', display: 'Diastolic blood pressure' }],
        },
        valueQuantity: quantity(o.diastolicValue, o.diastolicUnit),
      },
    ].filter(Boolean)
  } else if (o.valueQuantity !== undefined) {
    obs.valueQuantity = quantity(o.valueQuantity, o.valueUnit)
  }

  if (o.rangeLow !== undefined || o.rangeHigh !== undefined) {
    obs.referenceRange = [
      {
        low: o.rangeLow !== undefined ? quantity(o.rangeLow, o.valueUnit) : undefined,
        high: o.rangeHigh !== undefined ? quantity(o.rangeHigh, o.valueUnit) : undefined,
      },
    ]
  }

  return obs
}

function buildProcedure(p: ScenarioProcedure, refs: RefMap): FhirResource {
  return {
    resourceType: 'Procedure',
    id: p.id,
    meta: { profile: [PROFILE.Procedure] },
    status: p.status,
    category: p.category ? { coding: [{ system: SYSTEM.snomed, code: p.category }] } : undefined,
    code: p.procedureCode
      ? { coding: [{ code: p.procedureCode, display: p.procedureText }] }
      : undefined,
    subject: ref(refs, 'Patient', p.patientId),
    encounter: p.encounterId ? ref(refs, 'Encounter', p.encounterId) : undefined,
    performedDateTime: p.performedDate,
    performer: p.performerId
      ? [
          {
            function: p.performerFunction
              ? { coding: [{ system: SYSTEM.perfFunction, code: p.performerFunction }] }
              : undefined,
            actor: ref(refs, 'Practitioner', p.performerId),
          },
        ]
      : undefined,
    bodySite: p.bodySite ? [{ text: p.bodySite }] : undefined,
    reasonCode: p.reasonCode ? [{ coding: [{ code: p.reasonCode }] }] : undefined,
    outcome: p.outcome ? { coding: [{ system: SYSTEM.snomed, code: p.outcome }] } : undefined,
  }
}

function buildDiagnosticReport(r: ScenarioDiagnosticReport, refs: RefMap): FhirResource {
  return {
    resourceType: 'DiagnosticReport',
    id: r.id,
    meta: { profile: [PROFILE.DiagnosticReport] },
    status: r.status,
    // HL7 v2-0074 has a fixed English display per code (e.g. LAB =
    // "Laboratory"). Scenario data ships Chinese ("實驗室檢驗") in
    // categoryText which trips HAPI's display validation. Drop display
    // entirely — same strategy as section.code (FHIR allows it). categoryText
    // is preserved indirectly via the report's own code.display below.
    category: r.categoryCode
      ? [{ coding: [{ system: SYSTEM.diagReportCategory, code: r.categoryCode }] }]
      : undefined,
    code: r.reportCode ? { coding: [{ code: r.reportCode, display: r.reportText }] } : undefined,
    subject: ref(refs, 'Patient', r.subjectId),
    encounter: r.encounterId ? ref(refs, 'Encounter', r.encounterId) : undefined,
    effectiveDateTime: r.effectiveDateTime,
    issued: r.issued,
    performer: r.performerId
      ? [ref(refs, 'Practitioner', r.performerId)].filter(Boolean)
      : undefined,
    result: r.resultId ? [ref(refs, 'Observation', r.resultId)].filter(Boolean) : undefined,
    conclusion: r.conclusion,
  }
}

function buildMedication(m: ScenarioMedication): FhirResource {
  return {
    resourceType: 'Medication',
    id: m.id,
    meta: { profile: [PROFILE.Medication] },
    code: m.code ? { coding: [{ code: m.code, display: m.display }] } : undefined,
  }
}

function buildMedicationRequest(mr: ScenarioMedicationRequest, refs: RefMap): FhirResource {
  const doseAndRate =
    mr.doseValue !== undefined ? [{ doseQuantity: quantity(mr.doseValue, mr.doseCode) }] : undefined
  const timing =
    mr.frequency !== undefined || mr.period !== undefined || mr.timingCode
      ? {
          repeat: { frequency: mr.frequency, period: mr.period, periodUnit: mr.periodUnit },
          code: mr.timingCode ? { coding: [{ code: mr.timingCode }] } : undefined,
        }
      : undefined
  const dosage: Array<Record<string, unknown>> = []
  if (mr.dosageText || doseAndRate || timing || mr.routeCode) {
    dosage.push({
      text: mr.dosageText,
      timing,
      route: mr.routeCode ? { coding: [{ code: mr.routeCode }] } : undefined,
      doseAndRate,
    })
  }
  const dispenseRequest =
    mr.durationValue !== undefined
      ? { expectedSupplyDuration: quantity(mr.durationValue, mr.durationCode) }
      : undefined
  return {
    resourceType: 'MedicationRequest',
    id: mr.id,
    meta: { profile: [PROFILE.MedicationRequest] },
    identifier: mr.idSystem ? [{ system: mr.idSystem, value: mr.id }] : undefined,
    status: mr.status,
    intent: mr.intent,
    medicationReference: mr.medicationId ? ref(refs, 'Medication', mr.medicationId) : undefined,
    subject: ref(refs, 'Patient', mr.patientId),
    encounter: mr.encounterId ? ref(refs, 'Encounter', mr.encounterId) : undefined,
    authoredOn: mr.authoredOn,
    requester: mr.requesterId ? ref(refs, 'Practitioner', mr.requesterId) : undefined,
    reasonReference: mr.reasonReferenceId
      ? [ref(refs, 'Condition', mr.reasonReferenceId)].filter(Boolean)
      : undefined,
    dosageInstruction: dosage.length ? dosage : undefined,
    dispenseRequest,
  }
}

// ---------------------------------------------------------------------------
// Composition + section building
// ---------------------------------------------------------------------------

interface SectionSpec {
  code: string
  title: string
  // For required IPS sections: when entries[] is empty, attach this
  // emptyReason instead of dropping the section. The coding goes into the
  // IPS-specific absent-unknown CodeSystem (verified via IPS IG); the THO
  // list-empty-reason CodeSystem doesn't include 'no-known-allergies' etc.
  emptyReason?: { code: string; display: string }
  entries: Array<{ reference: string } | undefined>
  // Inner XHTML for the section.text.div. If not provided, falls back to a
  // generic count summary. Pre-escaped by the narrative helper.
  narrativeHtml?: string
}

// XHTML narrative helpers. Every Composition.section needs ONE OF text,
// entries, or sub-sections (cmp-1 invariant). Even when emptyReason is set,
// the cmp-1 constraint still requires text/entries. We additionally make
// the narrative *informative* — listing actual entry content — so any
// downstream IPS viewer that renders section.text (most do) shows real
// data rather than an entry count.
//
// xmlns is mandatory per FHIR Narrative datatype (XHTML 1.0 strict).

// Escape user-controlled strings going into XHTML. We're inside an
// xmlns="http://www.w3.org/1999/xhtml" div, so the parser is strict —
// stray <, >, &, " will break rendering and possibly the entire bundle.
function esc(s: unknown): string {
  if (s === undefined || s === null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function narrative(innerHtml: string) {
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${innerHtml}</div>`,
  }
}

// Build a small narrative table from rows. Headers + rows are pre-escaped
// by the caller; we wrap with table/thead/tbody.
function htmlTable(headers: string[], rows: string[][]): string {
  if (!rows.length) return ''
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const trs = rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

// Narrative builders per section type — each takes the raw scenario items
// (NOT the bundle resources) so we have all the source fields. Lookups go
// through `lookup` to resolve referenced Medication.display etc.
interface NarrativeContext {
  medicationDisplayById: Map<string, string>
  encounterDateById: Map<string, string>
  observationById: Map<string, ScenarioObservation>
}

function narrativeProblemList(items: ScenarioCondition[]): string {
  if (!items.length) return '<div>No known problems</div>'
  const rows = items.map((c) => [
    esc(c.conditionText || c.conditionCode || c.id),
    esc(c.clinicalStatus ?? ''),
    esc(c.onsetDate ?? ''),
  ])
  return htmlTable(['Problem', 'Status', 'Onset'], rows)
}

function narrativeMedications(
  items: ScenarioMedicationRequest[],
  ctx: NarrativeContext,
): string {
  if (!items.length) return '<div>No known medications</div>'
  const rows = items.map((m) => [
    esc(m.medicationId ? ctx.medicationDisplayById.get(m.medicationId) ?? m.medicationId : ''),
    esc(m.status ?? ''),
    esc(m.dosageText ?? ''),
    esc(m.authoredOn ?? ''),
  ])
  return htmlTable(['Medication', 'Status', 'Dosage', 'Authored'], rows)
}

function narrativeAllergies(items: ScenarioAllergy[]): string {
  if (!items.length) return '<div>No known allergies</div>'
  const rows = items.map((a) => [
    esc(a.allergyCode || a.id),
    esc(a.clinicalStatus ?? ''),
    esc(a.criticality ?? ''),
    esc(a.reactionDescription ?? a.manifestation ?? ''),
  ])
  return htmlTable(['Substance', 'Status', 'Criticality', 'Reaction'], rows)
}

function narrativeResults(items: ScenarioObservation[]): string {
  if (!items.length) return '<div>No results available</div>'
  const rows = items.map((o) => {
    let value = ''
    if (o.valueQuantity !== undefined) value = `${o.valueQuantity} ${o.valueUnit ?? ''}`.trim()
    else if (o.systolicValue !== undefined || o.diastolicValue !== undefined)
      value = `${o.systolicValue ?? '?'}/${o.diastolicValue ?? '?'} ${o.systolicUnit ?? ''}`.trim()
    const range = (o.rangeLow !== undefined || o.rangeHigh !== undefined)
      ? `${o.rangeLow ?? ''}–${o.rangeHigh ?? ''} ${o.valueUnit ?? ''}`.trim()
      : ''
    return [esc(o.observationCode ?? o.id), esc(value), esc(range), esc(o.effectiveDate ?? '')]
  })
  return htmlTable(['Test', 'Value', 'Reference', 'Date'], rows)
}

function narrativeEncounters(items: ScenarioEncounter[]): string {
  if (!items.length) return '<div>No encounters recorded</div>'
  const rows = items.map((e) => [
    esc(e.id),
    esc(e.class ?? ''),
    esc(e.serviceTypeText ?? e.serviceType ?? ''),
    esc(e.periodStart ?? ''),
    esc(e.status ?? ''),
  ])
  return htmlTable(['ID', 'Class', 'Service', 'Start', 'Status'], rows)
}

function narrativeDiagnosticReports(
  items: ScenarioDiagnosticReport[],
  ctx: NarrativeContext,
): string {
  if (!items.length) return '<div>No diagnostic reports</div>'
  const rows = items.map((r) => [
    esc(r.reportText || r.reportCode || r.id),
    esc(r.categoryText ?? r.categoryCode ?? ''),
    esc(r.effectiveDateTime ?? ''),
    esc(r.conclusion ?? ''),
  ])
  return htmlTable(['Report', 'Category', 'Date', 'Conclusion'], rows)
}

function buildSection(spec: SectionSpec) {
  const entries = spec.entries.filter((e): e is { reference: string } => Boolean(e))
  // No-display LOINC coding — HAPI validates display against LOINC en-US
  // long names and rejects any other phrasing. We sidestep by omitting.
  const code = { coding: [{ system: SYSTEM.loinc, code: spec.code }] }

  // Required IPS section with no data → keep the section, add emptyReason
  // PLUS a narrative (cmp-1 demands text/entries/subSections — emptyReason
  // alone is not enough).
  if (!entries.length) {
    if (!spec.emptyReason) return null
    return {
      title: spec.title,
      code,
      text: narrative(spec.narrativeHtml ?? `<div>${esc(spec.emptyReason.display)}</div>`),
      emptyReason: {
        coding: [
          {
            system: SYSTEM.ipsAbsentUnknown,
            code: spec.emptyReason.code,
            display: spec.emptyReason.display,
          },
        ],
      },
    }
  }
  // Caller passes pre-built XHTML listing actual entries; fall back to
  // a count summary if a section opts out.
  const inner = spec.narrativeHtml ??
    `<div>${esc(spec.title)}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</div>`
  return {
    title: spec.title,
    code,
    text: narrative(inner),
    entry: entries,
  }
}

function buildCompositionIps(
  input: ScenarioResources,
  refs: RefMap,
  fileBase: string,
): FhirResource {
  const patient = pickList<ScenarioPatient>(input, 'patients', 'patient')[0]
  const encounter = pickList<ScenarioEncounter>(input, 'encounters', 'encounter')[0]
  const author = pickList<ScenarioPractitioner>(input, 'practitioners', 'practitioner')[0]
  const conditions = pickList<ScenarioCondition>(input, 'conditions', 'condition')
  const allergies = pickList<ScenarioAllergy>(input, 'allergies', 'allergyintolerance')
  const vitals = pickList<ScenarioObservation>(
    input,
    'observationVitalSigns',
    'observation-vital-signs',
  )
  const labs = pickList<ScenarioObservation>(
    input,
    'observationLaboratoryResults',
    'observation-laboratory-result',
  )
  const procedures = pickList<ScenarioProcedure>(input, 'procedures', 'procedure')
  const reports = pickList<ScenarioDiagnosticReport>(input, 'diagnosticReports', 'diagnosticreport')
  const meds = pickList<ScenarioMedicationRequest>(input, 'medicationRequests', 'medicationrequest')
  const medications = pickList<ScenarioMedication>(input, 'medications', 'medication')
  const encounters = pickList<ScenarioEncounter>(input, 'encounters', 'encounter')

  // Narrative lookup tables — let medication / encounter narratives resolve
  // referenced display strings without forcing each narrative builder to
  // re-walk the full input.
  const ctx: NarrativeContext = {
    medicationDisplayById: new Map(
      medications.filter((m) => m.id != null).map((m) => [m.id, m.display ?? m.code ?? m.id] as const),
    ),
    encounterDateById: new Map(
      encounters.filter((e) => e.id != null).map((e) => [e.id, e.periodStart ?? ''] as const),
    ),
    observationById: new Map(
      [...vitals, ...labs].filter((o) => o.id != null).map((o) => [o.id, o] as const),
    ),
  }

  // IPS REQUIRED sections — always present, with emptyReason if no data.
  // Codes from absent-unknown-uv-ips CodeSystem (verified via IPS IG):
  //   no-known-problems, no-known-medications, no-known-allergies
  const sections = [
    buildSection({
      ...IPS_SECTION.problemList,
      emptyReason: { code: 'no-known-problems', display: 'No known problems' },
      entries: conditions.map((c) => ref(refs, 'Condition', c.id)),
      narrativeHtml: narrativeProblemList(conditions),
    }),
    buildSection({
      ...IPS_SECTION.medications,
      emptyReason: { code: 'no-known-medications', display: 'No known medications' },
      entries: meds.map((m) => ref(refs, 'MedicationRequest', m.id)),
      narrativeHtml: narrativeMedications(meds, ctx),
    }),
    buildSection({
      ...IPS_SECTION.allergies,
      emptyReason: { code: 'no-known-allergies', display: 'No known allergies' },
      entries: allergies.map((a) => ref(refs, 'AllergyIntolerance', a.id)),
      narrativeHtml: narrativeAllergies(allergies),
    }),
    // IPS OPTIONAL sections — only added when data exists.
    buildSection({
      ...IPS_SECTION.vitalSigns,
      entries: vitals.map((o) => ref(refs, 'Observation', o.id)),
      narrativeHtml: narrativeResults(vitals),
    }),
    buildSection({
      ...IPS_SECTION.results,
      entries: labs.map((o) => ref(refs, 'Observation', o.id)),
      narrativeHtml: narrativeResults(labs),
    }),
    buildSection({
      ...IPS_SECTION.procedures,
      entries: procedures.map((p) => ref(refs, 'Procedure', p.id)),
    }),
    // Track #4-specific extra sections — non-IPS but valid FHIR. Lets step
    // 140's "符合案例摘要" reviewer see encounters + diagnostic reports.
    buildSection({
      ...IPS_SECTION.encounter,
      entries: encounters.map((e) => ref(refs, 'Encounter', e.id)),
      narrativeHtml: narrativeEncounters(encounters),
    }),
    buildSection({
      ...IPS_SECTION.diagnosticReports,
      entries: reports.map((r) => ref(refs, 'DiagnosticReport', r.id)),
      narrativeHtml: narrativeDiagnosticReports(reports, ctx),
    }),
  ].filter((s): s is NonNullable<typeof s> => s !== null)

  // Composition.text — satisfies dom-6 (FHIR best-practice: every domain
  // resource should carry a narrative). One-line summary is enough; the
  // section.text divs cover per-section detail.
  const narrativeText = `International Patient Summary for ${patient?.name ?? 'patient'} — ${sections.length} sections, ${conditions.length} problems, ${meds.length} medications.`
  return {
    resourceType: 'Composition',
    id: `${fileBase}-composition`,
    meta: { profile: [PROFILE.CompositionIps] },
    text: narrative(narrativeText),
    status: 'final',
    // IPS-prescribed Composition.type — Patient summary Document. Drop the
    // display here too for the same LOINC display-validation reason; HAPI
    // is fine without it.
    type: { coding: [{ system: SYSTEM.loinc, code: '60591-5' }] },
    subject: patient ? ref(refs, 'Patient', patient.id) : undefined,
    encounter: encounter ? ref(refs, 'Encounter', encounter.id) : undefined,
    date: new Date().toISOString(),
    author: author ? [ref(refs, 'Practitioner', author.id)].filter(Boolean) : undefined,
    title: 'International Patient Summary',
    section: sections,
  }
}

function buildCompositionTwcore(
  input: ScenarioResources,
  refs: RefMap,
  fileBase: string,
): FhirResource {
  // Original Consult-note shape — kept for parity with legacy TWCore tracks.
  // Same data, different LOINC code + title + profile.
  const patient = pickList<ScenarioPatient>(input, 'patients', 'patient')[0]
  const encounter = pickList<ScenarioEncounter>(input, 'encounters', 'encounter')[0]
  const author = pickList<ScenarioPractitioner>(input, 'practitioners', 'practitioner')[0]
  const conditions = pickList<ScenarioCondition>(input, 'conditions', 'condition')
  const allergies = pickList<ScenarioAllergy>(input, 'allergies', 'allergyintolerance')
  const vitals = pickList<ScenarioObservation>(
    input,
    'observationVitalSigns',
    'observation-vital-signs',
  )
  const labs = pickList<ScenarioObservation>(
    input,
    'observationLaboratoryResults',
    'observation-laboratory-result',
  )
  const procedures = pickList<ScenarioProcedure>(input, 'procedures', 'procedure')
  const reports = pickList<ScenarioDiagnosticReport>(input, 'diagnosticReports', 'diagnosticreport')
  const meds = pickList<ScenarioMedicationRequest>(input, 'medicationRequests', 'medicationrequest')

  const section: Array<Record<string, unknown>> = []
  const addSection = (title: string, code: string, entries: Array<{ reference: string } | undefined>) => {
    const real = entries.filter((e): e is { reference: string } => Boolean(e))
    if (!real.length) return
    section.push({
      title,
      code: { coding: [{ system: SYSTEM.loinc, code, display: title }] },
      entry: real,
    })
  }

  if (encounter) addSection('Encounter', '46240-8', [ref(refs, 'Encounter', encounter.id)])
  addSection('Diagnosis', '11450-4', conditions.map((c) => ref(refs, 'Condition', c.id)))
  addSection('Allergies', '48765-2', allergies.map((a) => ref(refs, 'AllergyIntolerance', a.id)))
  addSection('Vital Signs', '8716-3', vitals.map((o) => ref(refs, 'Observation', o.id)))
  addSection('Laboratory', '30954-2', labs.map((o) => ref(refs, 'Observation', o.id)))
  addSection('Procedures', '47519-4', procedures.map((p) => ref(refs, 'Procedure', p.id)))
  addSection('Diagnostic Reports', '11502-2', reports.map((r) => ref(refs, 'DiagnosticReport', r.id)))
  addSection('Medications', '10160-0', meds.map((m) => ref(refs, 'MedicationRequest', m.id)))

  return {
    resourceType: 'Composition',
    id: `${fileBase}-composition`,
    meta: { profile: [PROFILE.CompositionTwcore] },
    status: 'final',
    type: { coding: [{ system: SYSTEM.loinc, code: '11488-4', display: 'Consult note' }] },
    subject: patient ? ref(refs, 'Patient', patient.id) : undefined,
    encounter: encounter ? ref(refs, 'Encounter', encounter.id) : undefined,
    date: new Date().toISOString(),
    author: author ? [ref(refs, 'Practitioner', author.id)].filter(Boolean) : undefined,
    title: '門診紀錄',
    section,
  }
}

// ---------------------------------------------------------------------------
// Top-level transform
// ---------------------------------------------------------------------------

export function transformScenarioToBundle(
  input: ScenarioResources,
  options: TransformOptions,
): DocumentBundle {
  const { fileBase, flavor = 'ips' } = options
  const refs = createRefMap()

  const all = {
    Organization: pickList<ScenarioOrganization>(input, 'organizations', 'organization'),
    Patient: pickList<ScenarioPatient>(input, 'patients', 'patient'),
    Practitioner: pickList<ScenarioPractitioner>(input, 'practitioners', 'practitioner'),
    PractitionerRole: pickList<ScenarioPractitionerRole>(
      input,
      'practitionerroles',
      'practitionerrole',
      'practitionerRoles',
    ),
    Encounter: pickList<ScenarioEncounter>(input, 'encounters', 'encounter'),
    Condition: pickList<ScenarioCondition>(input, 'conditions', 'condition'),
    AllergyIntolerance: pickList<ScenarioAllergy>(input, 'allergies', 'allergyintolerance'),
    Procedure: pickList<ScenarioProcedure>(input, 'procedures', 'procedure'),
    DiagnosticReport: pickList<ScenarioDiagnosticReport>(
      input,
      'diagnosticReports',
      'diagnosticreport',
    ),
    Medication: pickList<ScenarioMedication>(input, 'medications', 'medication'),
    MedicationRequest: pickList<ScenarioMedicationRequest>(
      input,
      'medicationRequests',
      'medicationrequest',
    ),
  }
  const vitals = pickList<ScenarioObservation>(
    input,
    'observationVitalSigns',
    'observation-vital-signs',
  )
  const labs = pickList<ScenarioObservation>(
    input,
    'observationLaboratoryResults',
    'observation-laboratory-result',
  )

  // Assign URN refs to every resource up-front so cross-references resolve.
  for (const [type, list] of Object.entries(all)) {
    for (const r of list) refs.assign(type, r.id)
  }
  for (const o of [...vitals, ...labs]) refs.assign('Observation', o.id)

  const entries: BundleEntry[] = []
  const compositionFullUrl = `urn:uuid:${randomUuid()}`
  const composition =
    flavor === 'twcore'
      ? buildCompositionTwcore(input, refs, fileBase)
      : buildCompositionIps(input, refs, fileBase)
  entries.push({ fullUrl: compositionFullUrl, resource: composition })

  const push = <T extends { id: string }>(
    type: string,
    builder: (item: T, refs: RefMap) => FhirResource,
    list: T[],
  ) => {
    for (const item of list) {
      const fullUrl = refs.get(type, item.id) as string
      entries.push({ fullUrl, resource: builder(item, refs) })
    }
  }

  push<ScenarioPatient>('Patient', buildPatient, all.Patient)
  push<ScenarioOrganization>('Organization', (o) => buildOrganization(o), all.Organization)
  push<ScenarioPractitioner>('Practitioner', buildPractitioner, all.Practitioner)
  push<ScenarioPractitionerRole>('PractitionerRole', buildPractitionerRole, all.PractitionerRole)
  push<ScenarioEncounter>('Encounter', buildEncounter, all.Encounter)
  push<ScenarioCondition>('Condition', buildCondition, all.Condition)
  push<ScenarioAllergy>('AllergyIntolerance', buildAllergyIntolerance, all.AllergyIntolerance)

  for (const o of vitals) {
    entries.push({
      fullUrl: refs.get('Observation', o.id) as string,
      resource: buildObservation(o, refs, 'vital'),
    })
  }
  for (const o of labs) {
    entries.push({
      fullUrl: refs.get('Observation', o.id) as string,
      resource: buildObservation(o, refs, 'lab'),
    })
  }

  push<ScenarioProcedure>('Procedure', buildProcedure, all.Procedure)
  push<ScenarioDiagnosticReport>('DiagnosticReport', buildDiagnosticReport, all.DiagnosticReport)
  push<ScenarioMedication>('Medication', (m) => buildMedication(m), all.Medication)
  push<ScenarioMedicationRequest>('MedicationRequest', buildMedicationRequest, all.MedicationRequest)

  const bundle: DocumentBundle = {
    resourceType: 'Bundle',
    id: fileBase,
    type: 'document',
    // IPS requires Bundle.identifier with a stable system. urn:ietf:rfc:3986
    // is the SDoH-blessed system for arbitrary URI-form identifiers — pairs
    // with our compositionFullUrl semantics.
    identifier: { system: 'urn:ietf:rfc:3986', value: compositionFullUrl },
    timestamp: new Date().toISOString(),
    entry: entries,
  }
  // IPS profile claim on the Bundle itself when flavor='ips'.
  if (flavor === 'ips') {
    ;(bundle as DocumentBundle & { meta?: { profile?: string[] } }).meta = {
      profile: [PROFILE.BundleIps],
    }
  }
  return bundle
}

// ---------------------------------------------------------------------------
// Convenience: pull `result.resources` out of a FHIRfox session payload.
// ---------------------------------------------------------------------------

export function bundleFromFhirfoxSession(
  payload: FhirfoxSessionPayload,
  flavor: 'ips' | 'twcore' = 'ips',
): DocumentBundle {
  return transformScenarioToBundle(payload.result.resources, {
    fileBase: payload.scenario.id,
    flavor,
  })
}
