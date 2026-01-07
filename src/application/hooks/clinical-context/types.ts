// Clinical Context Types
export interface CodeText { 
  text?: string
  coding?: Array<{ 
    display?: string
    code?: string
  }>
}

export interface ValueQuantity { 
  value?: number | string
  unit?: string 
}

export interface Observation {
  id?: string
  code?: CodeText
  valueQuantity?: ValueQuantity
  valueString?: string
  effectiveDateTime?: string
  component?: Array<{
    code?: {
      text?: string
      coding?: Array<{ display?: string }>
    }
    valueQuantity?: ValueQuantity
  }>
}

export interface DiagnosticReport {
  id?: string
  code?: CodeText
  result?: Array<{ reference?: string }>
  conclusion?: string
  effectiveDateTime?: string
}

export interface ProcedureResource {
  code?: {
    text?: string
    coding?: Array<{ display?: string }>
  }
  status?: string
  performedDateTime?: string
  performedPeriod?: {
    start?: string
    end?: string
  }
}

export type ClinicalData = {
  conditions?: Array<{ code?: CodeText }>
  medications?: Array<{ 
    medicationCodeableConcept?: CodeText
    status?: string
    authoredOn?: string
  }>
  allergies?: Array<{ code?: CodeText }>
  diagnosticReports?: DiagnosticReport[]
  observations?: Observation[]
  vitalSigns?: Observation[]
  procedures?: ProcedureResource[]
}
