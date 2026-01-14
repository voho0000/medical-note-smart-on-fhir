// Domain Entity: Allergy/Intolerance
// Independent of FHIR or any specific data source format

export interface AllergyEntity {
  id: string
  code: string
  displayName: string
  type?: 'allergy' | 'intolerance'
  category?: string[]
  criticality?: 'low' | 'high' | 'unable-to-assess'
  clinicalStatus: string
  verificationStatus?: string
  
  // Temporal information
  onsetDate?: Date
  recordedDate?: Date
  lastOccurrence?: Date
  
  // Reactions
  reactions?: AllergyReaction[]
  
  // Additional metadata
  notes?: string[]
  
  // Source tracking
  sourceSystem?: string
  sourceId?: string
}

export interface AllergyReaction {
  substance?: string
  manifestations: string[]
  description?: string
  onset?: Date
  severity?: 'mild' | 'moderate' | 'severe'
  exposureRoute?: string
}
