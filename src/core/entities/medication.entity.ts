// Domain Entity: Medication
// Independent of FHIR or any specific data source format

export interface MedicationEntity {
  id: string
  code: string
  displayName: string
  status: string
  authoredDate?: Date
  effectiveDate?: Date
  
  // Dosage information
  dosageInstructions?: DosageInstruction[]
  
  // Dispensing information
  dispenseRequest?: {
    validityPeriod?: {
      start?: Date
      end?: Date
    }
    expectedSupplyDuration?: {
      value: number
      unit: string
    }
  }
  
  // Additional metadata
  notes?: string[]
  
  // Source tracking
  sourceSystem?: string
  sourceId?: string
}

export interface DosageInstruction {
  text?: string
  timing?: {
    frequency?: number
    period?: number
    periodUnit?: string
  }
  route?: string
  doseQuantity?: {
    value: number
    unit: string
  }
}
