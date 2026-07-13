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
  comparator?: '<' | '<=' | '>=' | '>'
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
  performer?: Array<{ display?: string; reference?: string }>
  // Authoritative blood/urine signal (bridge sets specimen.display)
  specimen?: Reference
}

// Diagnostic Report Types
export interface DiagnosticReport {
  id?: string
  resourceType?: string
  identifier?: Identifier[]
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
  imagingStudy?: Reference[]
  note?: Array<{ text?: string }>
  presentedForm?: Array<{
    contentType?: string
    title?: string
    // base64 (no `data:<mime>;base64,` prefix) — bridge v0.14.0+ inline imaging
    data?: string
    size?: number
    // Local-bundle import path: base64 moved to an off-heap IndexedDB Blob,
    // `data` replaced by this Blob key (LocalBundleService.extractAndStoreImages).
    _imageRef?: string
  }>
  performer?: Array<{ display?: string; reference?: string }>
  _observations?: Observation[]
}

// Imaging Study Types (FHIR R4)
// Metadata for a DICOM imaging study. The app intentionally consumes only the
// resource's text/structured metadata; it does not retrieve or decode DICOM
// instances from Endpoint references.
export interface ImagingStudySeriesInstance {
  uid?: string
  sopClass?: Coding
  number?: number
  title?: string
}

export interface ImagingStudySeries {
  uid?: string
  number?: number
  modality?: Coding
  description?: string
  numberOfInstances?: number
  endpoint?: Reference[]
  bodySite?: Coding
  laterality?: Coding
  specimen?: Reference[]
  started?: string
  performer?: Array<{
    function?: CodeableConcept
    actor?: Reference
  }>
  instance?: ImagingStudySeriesInstance[]
}

export interface ImagingStudy {
  id?: string
  resourceType?: string
  identifier?: Identifier[]
  status?: string
  modality?: Coding[]
  subject?: Reference
  encounter?: Reference
  started?: string
  basedOn?: Reference[]
  referrer?: Reference
  interpreter?: Reference[]
  endpoint?: Reference[]
  numberOfSeries?: number
  numberOfInstances?: number
  procedureReference?: Reference
  procedureCode?: CodeableConcept[]
  location?: Reference
  reasonCode?: CodeableConcept[]
  reasonReference?: Reference[]
  note?: Array<{ text?: string }>
  description?: string
  series?: ImagingStudySeries[]
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
  category?: CodeableConcept[]
  requester?: Reference
  reasonCode?: CodeableConcept[]
  courseOfTherapyType?: CodeableConcept
  // Marker stamped by LocalBundleService.parse (MedicationRequest vs
  // MedicationStatement); bridge data omits it
  _sourceResourceType?: 'MedicationRequest' | 'MedicationStatement'
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
  // Bridge alternate field name for recordedDate
  dateRecorded?: string
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
  // Bridge alternate field name for recordedDate
  recorded?: string
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
