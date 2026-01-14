// Domain Entity: Procedure
// Independent of FHIR or any specific data source format

export interface ProcedureEntity {
  id: string
  code: string
  displayName: string
  category?: string
  status: string
  performedDate?: Date
  performedPeriod?: {
    start?: Date
    end?: Date
  }
  
  // Procedure details
  performers?: string[]
  location?: string
  reasonCodes?: string[]
  bodySites?: string[]
  outcome?: string
  
  // Follow-up and complications
  followUp?: string[]
  complications?: string[]
  
  // Additional metadata
  notes?: string[]
  reportIds?: string[]
  
  // Source tracking
  sourceSystem?: string
  sourceId?: string
}
