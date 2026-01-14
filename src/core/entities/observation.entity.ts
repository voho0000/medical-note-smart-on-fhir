// Domain Entity: Observation
// Independent of FHIR or any specific data source format
// This represents the business concept of an observation in our domain

export interface ObservationValue {
  value: number | string
  unit?: string
}

export interface ObservationComponent {
  code: string
  displayName?: string
  value: ObservationValue
  interpretation?: string
  referenceRange?: ReferenceRange
}

export interface ReferenceRange {
  low?: number
  high?: number
  text?: string
}

export interface ObservationEntity {
  id: string
  code: string
  displayName: string
  category?: string[]
  status: string
  effectiveDate?: Date
  issuedDate?: Date
  
  // Value can be simple or composite
  value?: ObservationValue
  components?: ObservationComponent[]
  
  // Clinical interpretation
  interpretation?: string
  referenceRange?: ReferenceRange
  
  // Additional metadata
  notes?: string[]
  bodySite?: string
  method?: string
  
  // Source tracking (for multi-hospital support)
  sourceSystem?: string
  sourceId?: string
}
