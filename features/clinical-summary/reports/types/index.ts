// Types for Reports
export type Coding = { system?: string; code?: string; display?: string }
export type Quantity = { value?: number; unit?: string }
export type CodeableConcept = { text?: string; coding?: Coding[] }
export type ReferenceRange = { low?: Quantity; high?: Quantity; text?: string }

export type ObsComponent = {
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  interpretation?: CodeableConcept
  referenceRange?: ReferenceRange[]
}

export type Observation = {
  resourceType?: "Observation"
  id?: string
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueString?: string
  interpretation?: CodeableConcept
  referenceRange?: ReferenceRange[]
  component?: ObsComponent[]
  hasMember?: { reference?: string }[]
  effectiveDateTime?: string
  status?: string
  category?: CodeableConcept[]
  encounter?: { reference?: string }
}

export interface DiagnosticReport {
  id?: string
  resourceType?: "DiagnosticReport"
  code?: CodeableConcept
  status?: string
  issued?: string
  effectiveDateTime?: string
  result?: { reference?: string }[]
  category?: CodeableConcept | CodeableConcept[]
  conclusion?: string
  conclusionCode?: CodeableConcept[]
  note?: { text?: string }[]
  presentedForm?: { title?: string; contentType?: string }[]
  _observations?: Observation[]
}

export type ReportGroup = "lab" | "imaging" | "procedures" | "other"

export type Row = { 
  id: string
  title: string
  meta: string
  obs: Observation[]
  group: ReportGroup 
}
