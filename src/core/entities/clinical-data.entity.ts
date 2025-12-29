// Core Domain Entities: Clinical Data

export interface ConditionEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
}

export interface MedicationEntity {
  id: string
  medicationCodeableConcept?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  status?: string
  intent?: string
  authoredOn?: string
  dosageInstruction?: Array<{
    text?: string
    route?: {
      text?: string
    }
    timing?: {
      repeat?: {
        frequency?: number
        period?: number
        periodUnit?: string
      }
    }
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number
        unit?: string
      }
    }>
  }>
}

export interface AllergyEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  clinicalStatus?: string
  verificationStatus?: string
  criticality?: string
  reaction?: Array<{
    manifestation?: Array<{
      text?: string
    }>
    severity?: string
  }>
  recordedDate?: string
}

export interface ObservationEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  valueQuantity?: {
    value?: number
    unit?: string
  }
  valueString?: string
  component?: Array<{
    code?: {
      coding?: Array<{
        code?: string
        display?: string
      }>
    }
    valueQuantity?: {
      value?: number
      unit?: string
    }
  }>
  effectiveDateTime?: string
  status?: string
  category?: Array<{
    coding?: Array<{
      code?: string
      system?: string
    }>
    text?: string
  }>
}

export interface DiagnosticReportEntity {
  id: string
  code?: {
    text?: string
  }
  result?: Array<{
    reference?: string
  }>
  conclusion?: string
  effectiveDateTime?: string
  _observations?: ObservationEntity[]
}

export interface ProcedureEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      display?: string
    }>
  }
  status?: string
  performedDateTime?: string
  performedPeriod?: {
    start?: string
    end?: string
  }
}

export interface EncounterEntity {
  id: string
  status?: string
  class?: {
    code?: string
    display?: string
  }
  type?: Array<{
    text?: string
  }>
  period?: {
    start?: string
    end?: string
  }
  reasonCode?: Array<{
    text?: string
  }>
}

export interface ClinicalDataCollection {
  conditions: ConditionEntity[]
  medications: MedicationEntity[]
  allergies: AllergyEntity[]
  observations: ObservationEntity[]
  vitalSigns: ObservationEntity[]
  diagnosticReports: DiagnosticReportEntity[]
  procedures: ProcedureEntity[]
  encounters: EncounterEntity[]
}
