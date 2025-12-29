// Types for Diagnosis
export interface Coding {
  system?: string
  code?: string
  display?: string
}

export interface CodeableConcept {
  coding?: Coding[]
  text?: string
}

export interface Category {
  coding?: Coding[]
  text?: string
}

export interface Condition {
  id?: string
  code?: CodeableConcept
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  category?: Category[]
  onsetDateTime?: string
  recordedDate?: string
  encounter?: { reference?: string }
}

export interface DiagnosisRow {
  id: string
  title: string
  when?: string
  verification?: string
  clinical?: string
  categories: string[]
}
