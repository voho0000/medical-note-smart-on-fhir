// Types for Medications
export type Coding = { 
  system?: string 
  code?: string 
  display?: string 
}

export type CodeableConcept = { 
  text?: string 
  coding?: Coding[] 
}

export type TimingRepeat = {
  frequency?: number
  period?: number
  periodUnit?: string
  boundsDuration?: DurationLike
  boundsPeriod?: PeriodLike
}

export type DoseAndRate = {
  doseQuantity?: { value?: number; unit?: string }
  doseRange?: { 
    low?: { value?: number; unit?: string } 
    high?: { value?: number; unit?: string } 
  }
}

export type DosageInstruction = {
  text?: string
  route?: CodeableConcept
  timing?: { repeat?: TimingRepeat }
  doseAndRate?: DoseAndRate[]
}

export type Medication = {
  id?: string
  resourceType?: string
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  medicationReference?: { display?: string }
  authoredOn?: string
  effectiveDateTime?: string
  dosageInstruction?: DosageInstruction[]
  dosage?: DosageInstruction[]
  code?: CodeableConcept
  medication?: CodeableConcept
  resource?: {
    code?: CodeableConcept
  }
  dispenseRequest?: {
    validityPeriod?: PeriodLike
    expectedSupplyDuration?: DurationLike
  }
}

export type MedicationRow = {
  id: string
  title: string
  status: string
  dose?: string
  route?: string
  frequency?: string
  detail?: string
  startedOn?: string
  stoppedOn?: string
  durationDays?: number
  isInactive: boolean
}

export type DurationLike = {
  value?: number
  unit?: string
  code?: string
}

export type PeriodLike = {
  start?: string
  end?: string
}
