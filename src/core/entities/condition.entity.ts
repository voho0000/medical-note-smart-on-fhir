// Domain Entity: Condition (Diagnosis)
// Independent of FHIR or any specific data source format

export interface ConditionEntity {
  id: string
  code: string
  displayName: string
  category?: string[]
  clinicalStatus: string
  verificationStatus?: string
  severity?: string
  
  // Temporal information
  onsetDate?: Date
  abatementDate?: Date
  recordedDate?: Date
  
  // Clinical details
  bodySites?: string[]
  stage?: string
  evidence?: string[]
  
  // Additional metadata
  notes?: string[]
  
  // Source tracking
  sourceSystem?: string
  sourceId?: string
}
