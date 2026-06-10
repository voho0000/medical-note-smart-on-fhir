// Types for the FHIRfox conference scenario API + our converter output.
//
// The conference's FHIRfox tool (https://twcat-fhirfox.dicom.org.tw) is the
// canonical source of test scenarios. Each scenario is a flat dictionary of
// "what happened to this patient" — NOT a FHIR Bundle. Participants must
// reshape it into a proper FHIR R4 document Bundle to demonstrate IG
// conformance. That conversion is what `transformScenarioToIpsBundle` does.
//
// The flat shape uses kebab-case keys (e.g. `observation-laboratory-result`)
// in the API response and singular forms in legacy hand-edited fixtures.
// `pickList` in the transformer tolerates both.

export interface ScenarioPatient {
  id: string
  idSystem?: string
  idNumber?: string
  active?: boolean
  name?: string
  telecomSystem?: string
  telecomUse?: string
  telecomValue?: string
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  address?: string
  organization?: string
}

export interface ScenarioOrganization {
  id: string
  idSystem?: string
  identifierValue?: string
  active?: boolean
  type?: string
  name?: string
  telecomSystem?: string
  telecomUse?: string
  telecomValue?: string
  address?: string
}

export interface ScenarioEncounter {
  id: string
  idSystem?: string
  status?: string
  class?: string
  type?: string
  serviceType?: string
  serviceTypeText?: string
  patientId?: string
  practitionerId?: string
  participantType?: string
  periodStart?: string
  periodEnd?: string
  reasonCode?: string
  conditionId?: string
  diagnosisUse?: string
  admitSource?: string
  dischargeDisposition?: string
  serviceProviderId?: string
}

export interface ScenarioPractitioner {
  id: string
  medicalLicenseNumber?: string
  medicalLicenseSystem?: string
  active?: boolean
  name?: string
  telecomSystem?: string
  telecomUse?: string
  telecomValue?: string
  address?: string
  gender?: string
  birthday?: string
  qualificationCode?: string
  qualificationIssuer?: string
}

export interface ScenarioPractitionerRole {
  id: string
  idSystem?: string
  identifierValue?: string
  active?: boolean
  periodStart?: string
  periodEnd?: string
  practitionerId?: string
  organizationId?: string
  roleCode?: string
  roleText?: string
  specialtyCode?: string
  telecomSystem?: string
  telecomUse?: string
  telecomValue?: string
}

export interface ScenarioCondition {
  id: string
  clinicalStatus?: string
  verificationStatus?: string
  category?: string
  severity?: string
  conditionCode?: string
  conditionText?: string
  patientId?: string
  encounterId?: string
  onsetDate?: string
  recorderId?: string
  asserterId?: string
  note?: string
}

export interface ScenarioAllergy {
  id: string
  clinicalStatus?: string
  verificationStatus?: string
  type?: 'allergy' | 'intolerance'
  category?: string
  criticality?: 'low' | 'high' | 'unable-to-assess'
  allergyCode?: string
  patientId?: string
  encounterId?: string
  onsetDate?: string
  recordedDate?: string
  recorderId?: string
  asserterId?: string
  lastOccurrence?: string
  note?: string
  manifestation?: string
  reactionSubstance?: string
  severity?: 'mild' | 'moderate' | 'severe'
  exposureRoute?: string
  reactionDescription?: string
}

export interface ScenarioObservation {
  id: string
  status?: string
  categoryCode?: string
  observationCode?: string
  patientId?: string
  encounterId?: string
  effectiveDate?: string
  performerId?: string
  // Single-value
  valueQuantity?: number
  valueUnit?: string
  // BP-style component-based
  systolicValue?: number
  systolicUnit?: string
  diastolicValue?: number
  diastolicUnit?: string
  // Reference range
  rangeLow?: number
  rangeHigh?: number
}

export interface ScenarioProcedure {
  id: string
  status?: string
  category?: string
  procedureCode?: string
  procedureText?: string
  patientId?: string
  encounterId?: string
  performedDate?: string
  performerId?: string
  performerFunction?: string
  bodySite?: string
  reasonCode?: string
  outcome?: string
}

export interface ScenarioDiagnosticReport {
  id: string
  status?: string
  categoryCode?: string
  categoryText?: string
  reportCode?: string
  reportText?: string
  subjectId?: string
  encounterId?: string
  effectiveDateTime?: string
  issued?: string
  performerId?: string
  resultId?: string
  conclusion?: string
}

export interface ScenarioMedication {
  id: string
  code?: string
  display?: string
}

export interface ScenarioMedicationRequest {
  id: string
  idSystem?: string
  status?: string
  intent?: string
  medicationId?: string
  patientId?: string
  encounterId?: string
  authoredOn?: string
  requesterId?: string
  reasonReferenceId?: string
  doseValue?: number
  doseCode?: string
  frequency?: number
  period?: number
  periodUnit?: string
  timingCode?: string
  routeCode?: string
  dosageText?: string
  durationValue?: number
  durationCode?: string
}

/**
 * The full FHIRfox session payload. `result.resources` is what the converter
 * actually consumes — the rest is metadata about the scenario itself.
 */
export interface FhirfoxSessionPayload {
  session: {
    id: string
    scenarioId: string
    expectedIg?: string
    seed?: string
    createdAt?: string
    status?: string
    sourceScenarioId?: string
  }
  scenario: {
    id: string
    displayName?: string
    summary?: string
    details?: string
    level?: number
    trackId?: string
    trackName?: string
    expectedIg?: string
    sourceScenarioId?: string
    type?: string
  }
  result: {
    scenarioId: string
    resources: ScenarioResources
  }
  mapping?: {
    orderedSourceKeys?: string[]
    bundleEntrySourceKeys?: string[]
  }
}

/**
 * The flat resource bag. The API uses singular lowercase keys
 * (`observation-laboratory-result`); legacy hand-edited files use plural
 * camelCase (`observationLaboratoryResults`). The transformer accepts both
 * via `pickList`.
 */
export interface ScenarioResources {
  patient?: ScenarioPatient[]
  patients?: ScenarioPatient[]
  organization?: ScenarioOrganization[]
  organizations?: ScenarioOrganization[]
  encounter?: ScenarioEncounter[]
  encounters?: ScenarioEncounter[]
  practitioner?: ScenarioPractitioner[]
  practitioners?: ScenarioPractitioner[]
  practitionerrole?: ScenarioPractitionerRole[]
  practitionerRoles?: ScenarioPractitionerRole[]
  practitionerroles?: ScenarioPractitionerRole[]
  condition?: ScenarioCondition[]
  conditions?: ScenarioCondition[]
  allergyintolerance?: ScenarioAllergy[]
  allergies?: ScenarioAllergy[]
  'observation-vital-signs'?: ScenarioObservation[]
  observationVitalSigns?: ScenarioObservation[]
  'observation-laboratory-result'?: ScenarioObservation[]
  observationLaboratoryResults?: ScenarioObservation[]
  procedure?: ScenarioProcedure[]
  procedures?: ScenarioProcedure[]
  diagnosticreport?: ScenarioDiagnosticReport[]
  diagnosticReports?: ScenarioDiagnosticReport[]
  medication?: ScenarioMedication[]
  medications?: ScenarioMedication[]
  medicationrequest?: ScenarioMedicationRequest[]
  medicationRequests?: ScenarioMedicationRequest[]
}

// Generic FHIR resource shape for the bundle output (transformer-produced).
export interface FhirResource {
  resourceType: string
  id?: string
  meta?: { profile?: string[] }
  // The transformer produces a wide variety of fields per resourceType.
  // We don't model every FHIR R4 field here — the JSON is consumed by the
  // FHIR validator, not by typed-app code.
  [key: string]: unknown
}

export interface BundleEntry {
  fullUrl: string
  resource: FhirResource
}

export interface DocumentBundle {
  resourceType: 'Bundle'
  id?: string
  type: 'document'
  identifier?: { system: string; value: string }
  timestamp?: string
  entry: BundleEntry[]
}

export interface TransformOptions {
  /** ID used in Composition.id (`<id>-composition`) and Bundle.id. */
  fileBase: string
  /**
   * Profile flavor for sections and Composition meta.
   *   - 'ips':    pass IPS Validator (default for Track #4)
   *   - 'twcore': original TWCore Consult note output (legacy / TWCore tracks)
   */
  flavor?: 'ips' | 'twcore'
}
