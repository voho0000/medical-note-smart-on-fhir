// Shared FHIR Types - Core Domain Types
// These types represent FHIR R4 resources used across the application

export interface Coding {
  system?: string
  code?: string
  display?: string
}

export interface CodeableConcept {
  text?: string
  coding?: Coding[]
}

export interface Quantity {
  value?: number
  unit?: string
  system?: string
  code?: string
}

export interface Period {
  start?: string
  end?: string
}

export interface Reference {
  reference?: string
  display?: string
}

export interface Identifier {
  system?: string
  value?: string
  use?: string
}

// Observation Types
export interface ObservationComponent {
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  valueCodeableConcept?: CodeableConcept
  interpretation?: CodeableConcept
  referenceRange?: ReferenceRange[]
}

export interface ReferenceRange {
  low?: Quantity
  high?: Quantity
  text?: string
}

export interface Observation {
  id?: string
  resourceType?: string
  code?: CodeableConcept
  status?: string
  category?: CodeableConcept[]
  subject?: Reference
  encounter?: Reference
  effectiveDateTime?: string
  effectivePeriod?: Period
  issued?: string
  valueQuantity?: Quantity
  valueString?: string
  valueCodeableConcept?: CodeableConcept
  interpretation?: CodeableConcept
  note?: Array<{ text?: string }>
  bodySite?: CodeableConcept
  method?: CodeableConcept
  referenceRange?: ReferenceRange[]
  hasMember?: Reference[]
  component?: ObservationComponent[]
}

// Diagnostic Report Types
export interface DiagnosticReport {
  id?: string
  resourceType?: string
  status?: string
  category?: CodeableConcept | CodeableConcept[]
  code?: CodeableConcept
  subject?: Reference
  encounter?: Reference
  effectiveDateTime?: string
  effectivePeriod?: Period
  issued?: string
  result?: Reference[]
  conclusion?: string
  conclusionCode?: CodeableConcept[]
  note?: Array<{ text?: string }>
  presentedForm?: Array<{
    contentType?: string
    title?: string
    data?: string
  }>
  _observations?: Observation[]
}

// Medication Types
export interface DosageInstruction {
  text?: string
  timing?: {
    repeat?: {
      frequency?: number
      period?: number
      periodUnit?: string
      boundsDuration?: Duration
      boundsPeriod?: Period
    }
  }
  route?: CodeableConcept
  doseAndRate?: Array<{
    doseQuantity?: Quantity
    doseRange?: {
      low?: Quantity
      high?: Quantity
    }
  }>
}

export interface Duration {
  value?: number
  unit?: string
  code?: string
}

export interface MedicationRequest {
  id?: string
  resourceType?: string
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  medicationReference?: Reference
  subject?: Reference
  encounter?: Reference
  authoredOn?: string
  effectiveDateTime?: string
  dosageInstruction?: DosageInstruction[]
  dispenseRequest?: {
    validityPeriod?: Period
    expectedSupplyDuration?: Duration
  }
}

// Condition (Diagnosis) Types
export interface Condition {
  id?: string
  resourceType?: string
  clinicalStatus?: CodeableConcept | string
  verificationStatus?: CodeableConcept | string
  category?: CodeableConcept[]
  severity?: CodeableConcept
  code?: CodeableConcept
  bodySite?: CodeableConcept[]
  subject?: Reference
  encounter?: Reference
  onsetDateTime?: string
  onsetAge?: Quantity
  onsetPeriod?: Period
  abatementDateTime?: string
  recordedDate?: string
  recorder?: Reference
  asserter?: Reference
  stage?: Array<{
    summary?: CodeableConcept
    assessment?: Reference[]
  }>
  evidence?: Array<{
    code?: CodeableConcept[]
    detail?: Reference[]
  }>
  note?: Array<{ text?: string }>
}

// Allergy Intolerance Types
export interface AllergyIntolerance {
  id?: string
  resourceType?: string
  clinicalStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  verificationStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  type?: string
  category?: string[]
  criticality?: string
  code?: CodeableConcept
  patient?: Reference
  encounter?: Reference
  onsetDateTime?: string
  recordedDate?: string
  recorder?: Reference
  asserter?: Reference
  lastOccurrence?: string
  note?: Array<{ text?: string }>
  reaction?: Array<{
    substance?: CodeableConcept
    manifestation?: CodeableConcept[]
    description?: string
    onset?: string
    severity?: string
    exposureRoute?: CodeableConcept
    note?: Array<{ text?: string }>
  }>
}

// Procedure Types
export interface Procedure {
  id?: string
  resourceType?: string
  status?: string
  category?: CodeableConcept
  code?: CodeableConcept
  subject?: Reference
  encounter?: Reference
  performedDateTime?: string
  performedPeriod?: Period
  recorder?: Reference
  asserter?: Reference
  performer?: Array<{
    function?: CodeableConcept
    actor?: Reference
  }>
  location?: Reference
  reasonCode?: CodeableConcept[]
  reasonReference?: Reference[]
  bodySite?: CodeableConcept[]
  outcome?: CodeableConcept
  report?: Reference[]
  complication?: CodeableConcept[]
  followUp?: CodeableConcept[]
  note?: Array<{ text?: string }>
}

// Patient Types
export interface HumanName {
  use?: string
  text?: string
  family?: string
  given?: string[]
  prefix?: string[]
  suffix?: string[]
}

export interface ContactPoint {
  system?: string
  value?: string
  use?: string
}

export interface Address {
  use?: string
  type?: string
  text?: string
  line?: string[]
  city?: string
  district?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface Patient {
  id?: string
  resourceType?: string
  identifier?: Identifier[]
  active?: boolean
  name?: HumanName[]
  telecom?: ContactPoint[]
  gender?: string
  birthDate?: string
  deceasedBoolean?: boolean
  deceasedDateTime?: string
  address?: Address[]
  maritalStatus?: CodeableConcept
  multipleBirthBoolean?: boolean
  multipleBirthInteger?: number
  photo?: Array<{
    contentType?: string
    data?: string
  }>
  contact?: Array<{
    relationship?: CodeableConcept[]
    name?: HumanName
    telecom?: ContactPoint[]
    address?: Address
  }>
  communication?: Array<{
    language?: CodeableConcept
    preferred?: boolean
  }>
}
