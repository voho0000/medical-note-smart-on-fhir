// IPS reverse mappers: ClinicalDataCollection entities -> FHIR resources with
// meta.profile, ready to drop into an IPS document Bundle.
//
// Phase 1 rule: reuse codings already present on the entities (ICD-10, LOINC,
// etc.). Do NOT fabricate or invent codes — in particular no SNOMED CT concept
// ids are generated here (that is Phase 2, gated by the SNOMED verification SOP).

import type {
  PatientEntity,
} from '@/src/core/entities/patient.entity'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'
import type {
  AllergyEntity,
  CarePlanEntity,
  ConditionEntity,
  ConsentEntity,
  DeviceEntity,
  DiagnosticReportEntity,
  ImmunizationEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  FhirCodeableConcept,
  FhirResource,
  IpsBundleEntry,
  SectionMapResult,
} from './ips-types'
import { INFERENCE_TAG, IPS_PROFILES, SYSTEM, VITAL_SIGNS_PROFILE } from './ips-constants'
import { formatDate, makeEntry } from './ips-helpers'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DATA_ABSENT_REASON_URL = 'http://hl7.org/fhir/StructureDefinition/data-absent-reason'
const DATA_ABSENT_CC: FhirCodeableConcept = {
  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/data-absent-reason', code: 'unknown' }],
}

/**
 * Spread helper for a required dateTime element. When the value is missing we
 * emit the primitive's sibling element with a data-absent-reason extension so
 * the 1..1 cardinality is satisfied without inventing a date.
 */
function requiredDateTime(field: string, value?: string): Record<string, unknown> {
  const formatted = value ? formatDate(value) : ''
  if (formatted) return { [field]: formatted }
  return { [`_${field}`]: { extension: [{ url: DATA_ABSENT_REASON_URL, valueCode: 'unknown' }] } }
}

/** Build a clean CodeableConcept; returns undefined when there is nothing usable. */
function toCodeableConcept(
  cc:
    | { text?: string; coding?: Array<{ code?: string; display?: string; system?: string }> }
    | undefined,
  fallbackText?: string,
): FhirCodeableConcept | undefined {
  const coding = (cc?.coding ?? [])
    .filter((c) => c && (c.code || c.display))
    .map((c) => ({
      ...(c.system ? { system: c.system } : {}),
      ...(c.code ? { code: c.code } : {}),
      ...(c.display ? { display: c.display } : {}),
    }))
  const text = cc?.text?.trim() || fallbackText?.trim()
  const out: FhirCodeableConcept = {}
  if (coding.length) out.coding = coding
  if (text) out.text = text
  return out.coding || out.text ? out : undefined
}

const VALID_CONDITION_CLINICAL = new Set([
  'active',
  'recurrence',
  'relapse',
  'inactive',
  'remission',
  'resolved',
])
function conditionClinicalStatus(raw?: string): FhirCodeableConcept {
  const code = raw && VALID_CONDITION_CLINICAL.has(raw.toLowerCase()) ? raw.toLowerCase() : 'active'
  return { coding: [{ system: SYSTEM.conditionClinical, code }] }
}

const VALID_ALLERGY_CLINICAL = new Set(['active', 'inactive', 'resolved'])
function allergyClinicalStatus(raw?: string): FhirCodeableConcept {
  const code = raw && VALID_ALLERGY_CLINICAL.has(raw.toLowerCase()) ? raw.toLowerCase() : 'active'
  return { coding: [{ system: SYSTEM.allergyClinical, code }] }
}

function pickStatus(raw: string | undefined, valid: string[], fallback: string): string {
  return raw && valid.includes(raw.toLowerCase()) ? raw.toLowerCase() : fallback
}

/** Observation value[x] or dataAbsentReason. */
function observationValueFields(o: ObservationEntity): Record<string, unknown> {
  if (o.valueQuantity && o.valueQuantity.value != null) {
    return {
      valueQuantity: {
        value: o.valueQuantity.value,
        ...(o.valueQuantity.unit ? { unit: o.valueQuantity.unit } : {}),
      },
    }
  }
  if (o.valueString && o.valueString.trim()) {
    return { valueString: o.valueString }
  }
  const vcc = toCodeableConcept(o.valueCodeableConcept)
  if (vcc) return { valueCodeableConcept: vcc }
  return { dataAbsentReason: DATA_ABSENT_CC }
}

function referenceRangeFields(o: Pick<ObservationEntity, 'referenceRange'>): Record<string, unknown> {
  if (!o.referenceRange?.length) return {}
  const ranges = o.referenceRange
    .map((r) => {
      const out: Record<string, unknown> = {}
      if (r.low?.value != null) out.low = { value: r.low.value, ...(r.low.unit ? { unit: r.low.unit } : {}) }
      if (r.high?.value != null) out.high = { value: r.high.value, ...(r.high.unit ? { unit: r.high.unit } : {}) }
      if (r.text) out.text = r.text
      return out
    })
    .filter((r) => Object.keys(r).length)
  return ranges.length ? { referenceRange: ranges } : {}
}

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------

export function buildPatient(patient: PatientEntity | null): { entry: IpsBundleEntry; reference: string } {
  const name = patient?.name?.[0]
  // Carry whatever the source had — text (TW Core/IPS local-script name),
  // family, given — so a round-trip never drops the name. Only when there is
  // no usable name at all do we fall back to the "Unknown Patient" sentinel.
  const nameArray =
    name && (name.text || name.family || name.given?.length)
      ? [
          {
            ...(name.text ? { text: name.text } : {}),
            ...(name.family ? { family: name.family } : {}),
            ...(name.given?.length ? { given: name.given } : {}),
          },
        ]
      : [{ text: getPatientDisplayName(patient) }]

  const resource: FhirResource = {
    resourceType: 'Patient',
    meta: { profile: [IPS_PROFILES.patient] },
    name: nameArray,
    ...(patient?.gender ? { gender: patient.gender } : {}),
    ...(patient?.birthDate ? { birthDate: formatDate(patient.birthDate) } : {}),
  }
  return makeEntry(resource)
}

// ---------------------------------------------------------------------------
// Allergies & Intolerances (required section)
// ---------------------------------------------------------------------------

export function mapAllergies(allergies: AllergyEntity[], patientRef: string): SectionMapResult {
  const entries = allergies.map((a) => {
    const reaction = a.reaction
      ?.map((r) => {
        const manifestation = (r.manifestation ?? [])
          .map((m) => toCodeableConcept({ text: m.text }))
          .filter(Boolean)
        if (!manifestation.length) return undefined
        return {
          manifestation,
          ...(r.severity ? { severity: r.severity } : {}),
        }
      })
      .filter(Boolean)

    const resource: FhirResource = {
      resourceType: 'AllergyIntolerance',
      meta: { profile: [IPS_PROFILES.allergyIntolerance] },
      clinicalStatus: allergyClinicalStatus(a.clinicalStatus),
      ...(a.verificationStatus
        ? {
            verificationStatus: {
              coding: [{ system: SYSTEM.allergyVerification, code: a.verificationStatus.toLowerCase() }],
            },
          }
        : {}),
      code: toCodeableConcept(a.code, 'Unknown allergy/intolerance') ?? { text: 'Unknown allergy/intolerance' },
      patient: { reference: patientRef },
      ...(a.criticality ? { criticality: a.criticality } : {}),
      ...(a.recordedDate ? { recordedDate: formatDate(a.recordedDate) } : {}),
      ...(reaction && reaction.length ? { reaction } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Medication Summary (required section) — emitted as MedicationStatement
// ---------------------------------------------------------------------------

const VALID_MED_STATEMENT_STATUS = [
  'active',
  'completed',
  'entered-in-error',
  'intended',
  'stopped',
  'on-hold',
  'unknown',
  'not-taken',
]

export function mapMedications(medications: MedicationEntity[], patientRef: string): SectionMapResult {
  const entries = medications.map((m) => {
    const dosage = m.dosageInstruction
      ?.map((d) => (d.text ? { text: d.text } : undefined))
      .filter(Boolean)

    const resource: FhirResource = {
      resourceType: 'MedicationStatement',
      meta: { profile: [IPS_PROFILES.medicationStatement] },
      status: pickStatus(m.status, VALID_MED_STATEMENT_STATUS, 'unknown'),
      medicationCodeableConcept:
        toCodeableConcept(m.medicationCodeableConcept, 'Unknown medication') ?? { text: 'Unknown medication' },
      subject: { reference: patientRef },
      ...requiredDateTime('effectiveDateTime', m.authoredOn),
      ...(dosage && dosage.length ? { dosage } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Problem List (required section)
// ---------------------------------------------------------------------------

/**
 * Build the IPS Condition.code. When the curation step attached a verified
 * SNOMED CT mapping (`_sct`, Phase 2.1), PREPEND it as the IPS-preferred coding
 * while KEEPING the original ICD-10 coding — dual-coding, so the machine-readable
 * resource carries both. The SNOMED preferred term doubles as the
 * CodeableConcept.text fallback so the resource stays self-describing even when
 * the source condition had no text.
 */
function problemCode(c: ConditionEntity): FhirCodeableConcept {
  const base =
    toCodeableConcept(c.code, c._sct?.display ?? 'Unknown problem') ?? {
      text: c._sct?.display ?? 'Unknown problem',
    }
  if (!c._sct) return base
  return {
    ...base,
    coding: [
      { system: c._sct.system, code: c._sct.code, display: c._sct.display },
      ...(base.coding ?? []),
    ],
  }
}

export function mapProblemList(conditions: ConditionEntity[], patientRef: string): SectionMapResult {
  const entries = conditions.map((c) => {
    const resource: FhirResource = {
      resourceType: 'Condition',
      meta: {
        profile: [IPS_PROFILES.condition],
        // Phase 2.2 — flag a confirmed AI-inferred problem for downstream audit.
        ...(c._inferred
          ? { tag: [{ system: INFERENCE_TAG.system, code: INFERENCE_TAG.code, display: INFERENCE_TAG.display }] }
          : {}),
      },
      clinicalStatus: conditionClinicalStatus(c.clinicalStatus),
      ...(c.verificationStatus
        ? {
            verificationStatus: {
              coding: [{ system: SYSTEM.conditionVerification, code: c.verificationStatus.toLowerCase() }],
            },
          }
        : {}),
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] },
      ],
      code: problemCode(c),
      subject: { reference: patientRef },
      ...(c.onsetDateTime ? { onsetDateTime: formatDate(c.onsetDateTime) } : {}),
      ...(c.recordedDate ? { recordedDate: formatDate(c.recordedDate) } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Immunizations
// ---------------------------------------------------------------------------

export function mapImmunizations(immunizations: ImmunizationEntity[], patientRef: string): SectionMapResult {
  const entries = immunizations.map((im) => {
    const resource: FhirResource = {
      resourceType: 'Immunization',
      meta: { profile: [IPS_PROFILES.immunization] },
      status: pickStatus(im.status, ['completed', 'entered-in-error', 'not-done'], 'completed'),
      vaccineCode: toCodeableConcept(im.vaccineCode, 'Unknown vaccine') ?? { text: 'Unknown vaccine' },
      patient: { reference: patientRef },
      ...requiredDateTime('occurrenceDateTime', im.occurrenceDateTime),
      ...(im.lotNumber ? { lotNumber: im.lotNumber } : {}),
      ...(im.manufacturer?.display ? { manufacturer: { display: im.manufacturer.display } } : {}),
      ...(im.note?.length ? { note: im.note.filter((n) => n.text).map((n) => ({ text: n.text })) } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export function mapProcedures(procedures: ProcedureEntity[], patientRef: string): SectionMapResult {
  const entries = procedures.map((p) => {
    const performed =
      p.performedDateTime
        ? { performedDateTime: formatDate(p.performedDateTime) }
        : p.performedPeriod?.start || p.performedPeriod?.end
          ? {
              performedPeriod: {
                ...(p.performedPeriod?.start ? { start: formatDate(p.performedPeriod.start) } : {}),
                ...(p.performedPeriod?.end ? { end: formatDate(p.performedPeriod.end) } : {}),
              },
            }
          : {}

    const resource: FhirResource = {
      resourceType: 'Procedure',
      meta: { profile: [IPS_PROFILES.procedure] },
      status: pickStatus(
        p.status,
        ['preparation', 'in-progress', 'not-done', 'on-hold', 'stopped', 'completed', 'entered-in-error', 'unknown'],
        'completed',
      ),
      code: toCodeableConcept(p.code, 'Unknown procedure') ?? { text: 'Unknown procedure' },
      subject: { reference: patientRef },
      ...performed,
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Vital Signs (base FHIR vital-signs profile)
// ---------------------------------------------------------------------------

export function mapVitalSigns(vitalSigns: ObservationEntity[], patientRef: string): SectionMapResult {
  const entries = vitalSigns.map((o) => {
    const components = o.component
      ?.map((comp) => {
        const code = toCodeableConcept(comp.code)
        if (!code) return undefined
        return {
          code,
          ...observationValueFields(comp as ObservationEntity),
        }
      })
      .filter(Boolean)

    const resource: FhirResource = {
      resourceType: 'Observation',
      meta: { profile: [VITAL_SIGNS_PROFILE] },
      status: pickStatus(o.status, ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'], 'final'),
      category: [{ coding: [{ system: SYSTEM.observationCategory, code: 'vital-signs' }] }],
      code: toCodeableConcept(o.code, 'Vital sign') ?? { text: 'Vital sign' },
      subject: { reference: patientRef },
      ...requiredDateTime('effectiveDateTime', o.effectiveDateTime),
      ...observationValueFields(o),
      ...referenceRangeFields(o),
      ...(components && components.length ? { component: components } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Diagnostic Results — DiagnosticReports (+ their observations) and lab observations
// ---------------------------------------------------------------------------

function buildResultObservation(
  o: ObservationEntity,
  patientRef: string,
  profile: string,
  categoryCode: string,
): IpsBundleEntry {
  const resource: FhirResource = {
    resourceType: 'Observation',
    meta: { profile: [profile] },
    status: pickStatus(o.status, ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'], 'final'),
    category: [{ coding: [{ system: SYSTEM.observationCategory, code: categoryCode }] }],
    code: toCodeableConcept(o.code, 'Result') ?? { text: 'Result' },
    subject: { reference: patientRef },
    ...requiredDateTime('effectiveDateTime', o.effectiveDateTime),
    ...observationValueFields(o),
    ...referenceRangeFields(o),
    ...(o.interpretation
      ? { interpretation: [toCodeableConcept(o.interpretation)].filter(Boolean) }
      : {}),
  }
  return makeEntry(resource).entry
}

export function mapResults(
  diagnosticReports: DiagnosticReportEntity[],
  labObservations: ObservationEntity[],
  patientRef: string,
): SectionMapResult {
  const entries: IpsBundleEntry[] = []
  const referencedOnly: IpsBundleEntry[] = []

  // Standalone lab observations -> Observation entries in the Results section.
  for (const o of labObservations) {
    entries.push(buildResultObservation(o, patientRef, IPS_PROFILES.observationResultsLaboratory, 'laboratory'))
  }

  // DiagnosticReports -> DiagnosticReport entries; their observations are added
  // to the Bundle (referencedOnly) and linked via DiagnosticReport.result.
  for (const dr of diagnosticReports) {
    const resultRefs: Array<{ reference: string }> = []
    for (const obs of dr._observations ?? []) {
      // Member observations of 健保存摺 / EHR reports are lab panel values, not
      // imaging. Default to the laboratory result profile (the previous
      // radiology/imaging hardcode mis-categorised every lab value).
      const obsEntry = buildResultObservation(obs, patientRef, IPS_PROFILES.observationResultsLaboratory, 'laboratory')
      referencedOnly.push(obsEntry)
      resultRefs.push({ reference: obsEntry.fullUrl })
    }

    const resource: FhirResource = {
      resourceType: 'DiagnosticReport',
      meta: { profile: [IPS_PROFILES.diagnosticReport] },
      status: pickStatus(dr.status, ['registered', 'partial', 'preliminary', 'final', 'amended', 'corrected', 'appended', 'cancelled', 'entered-in-error', 'unknown'], 'final'),
      code: toCodeableConcept(dr.code, 'Diagnostic report') ?? { text: 'Diagnostic report' },
      subject: { reference: patientRef },
      ...requiredDateTime('effectiveDateTime', dr.effectiveDateTime),
      ...(dr.issued ? { issued: dr.issued } : {}),
      ...(dr.conclusion ? { conclusion: dr.conclusion } : {}),
      ...(resultRefs.length ? { result: resultRefs } : {}),
      // NOTE: presentedForm (base64 imaging) is intentionally omitted — including
      // it would bloat the IPS document to tens of MB. Images stay in the app.
    }
    entries.push(makeEntry(resource).entry)
  }

  return { entries, referencedOnly }
}

// ---------------------------------------------------------------------------
// Medical Devices — DeviceUseStatement (+ referenced Device)
// ---------------------------------------------------------------------------

export function mapDevices(devices: DeviceEntity[], patientRef: string): SectionMapResult {
  const entries: IpsBundleEntry[] = []
  const referencedOnly: IpsBundleEntry[] = []

  for (const d of devices) {
    const deviceName = d.deviceName?.find((n) => n.name)?.name
    const deviceResource: FhirResource = {
      resourceType: 'Device',
      meta: { profile: [IPS_PROFILES.device] },
      ...(d.type ? { type: toCodeableConcept(d.type, deviceName || 'Device') } : deviceName ? { type: { text: deviceName } } : { type: { text: 'Device' } }),
      ...(d.manufacturer ? { manufacturer: d.manufacturer } : {}),
      ...(d.modelNumber ? { modelNumber: d.modelNumber } : {}),
      ...(d.deviceName?.length
        ? { deviceName: d.deviceName.filter((n) => n.name).map((n) => ({ name: n.name, type: n.type || 'user-friendly-name' })) }
        : {}),
      ...(d.udiCarrier?.length ? { udiCarrier: d.udiCarrier } : {}),
    }
    const deviceEntry = makeEntry(deviceResource)
    referencedOnly.push(deviceEntry.entry)

    const useResource: FhirResource = {
      resourceType: 'DeviceUseStatement',
      meta: { profile: [IPS_PROFILES.deviceUseStatement] },
      status: pickStatus(d.status, ['active', 'completed', 'entered-in-error', 'intended', 'stopped', 'on-hold'], 'active'),
      subject: { reference: patientRef },
      ...requiredDateTime('timingDateTime', d.manufactureDate),
      device: { reference: deviceEntry.reference },
      ...(d.note?.length ? { note: d.note.filter((n) => n.text).map((n) => ({ text: n.text })) } : {}),
    }
    entries.push(makeEntry(useResource).entry)
  }

  return { entries, referencedOnly }
}

// ---------------------------------------------------------------------------
// Plan of Care — CarePlan (base FHIR profile; IPS defines no CarePlan profile)
// ---------------------------------------------------------------------------

export function mapCarePlans(carePlans: CarePlanEntity[], patientRef: string): SectionMapResult {
  const entries = carePlans.map((cp) => {
    const resource: FhirResource = {
      resourceType: 'CarePlan',
      meta: { profile: [IPS_PROFILES.carePlan] },
      status: pickStatus(cp.status, ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'], 'active'),
      intent: pickStatus(cp.intent, ['proposal', 'plan', 'order', 'option'], 'plan'),
      subject: { reference: patientRef },
      ...(cp.title ? { title: cp.title } : {}),
      ...(cp.description ? { description: cp.description } : {}),
      ...(cp.category?.length ? { category: cp.category.map((c) => toCodeableConcept(c)).filter(Boolean) } : {}),
      ...(cp.period?.start || cp.period?.end
        ? {
            period: {
              ...(cp.period?.start ? { start: formatDate(cp.period.start) } : {}),
              ...(cp.period?.end ? { end: formatDate(cp.period.end) } : {}),
            },
          }
        : {}),
      ...(cp.created ? { created: cp.created } : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}

// ---------------------------------------------------------------------------
// Advance Directives — Consent (base FHIR profile; IPS defines no Consent profile)
// ---------------------------------------------------------------------------

export function mapAdvanceDirectives(consents: ConsentEntity[], patientRef: string): SectionMapResult {
  const entries = consents.map((c) => {
    const resource: FhirResource = {
      resourceType: 'Consent',
      meta: { profile: [IPS_PROFILES.consent] },
      status: pickStatus(c.status, ['draft', 'proposed', 'active', 'rejected', 'inactive', 'entered-in-error'], 'active'),
      scope: toCodeableConcept(c.scope) ?? {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'adr', display: 'Advanced Directive' }],
      },
      category: c.category?.length
        ? c.category.map((cat) => toCodeableConcept(cat)).filter(Boolean)
        : [{ coding: [{ system: 'http://loinc.org', code: '42348-3', display: 'Advance directives' }] }],
      patient: { reference: patientRef },
      ...(c.dateTime ? { dateTime: c.dateTime } : {}),
      ...(c.provision?.type
        ? {
            provision: {
              type: c.provision.type,
              ...(c.provision.period ? { period: c.provision.period } : {}),
            },
          }
        : {}),
    }
    return makeEntry(resource).entry
  })
  return { entries, referencedOnly: [] }
}
