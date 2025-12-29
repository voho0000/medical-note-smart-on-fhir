// Types for Allergies
export type Coding = { 
  system?: string 
  code?: string 
  display?: string 
}

export type CodeableConcept = { 
  text?: string 
  coding?: Coding[] 
}

export interface AllergyIntolerance {
  id?: string
  resourceType: string
  code?: CodeableConcept
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
  criticality?: string
  reaction?: Array<{
    manifestation?: Array<{
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }>
    severity?: string
    description?: string
    onset?: string
  }>
  recordedDate?: string
}
