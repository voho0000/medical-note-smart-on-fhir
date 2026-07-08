import type { CodeableConcept, Condition, Coding } from '@/src/shared/types/fhir.types'

export type { CodeableConcept, Condition, Coding }

// Type aliases for backward compatibility
export type Category = CodeableConcept
export interface DiagnosisRow {
  id: string
  title: string
  when?: string
  verification?: string
  clinical?: string
  categories: string[]
  /** mCODE cancer-staging summary (e.g. "Stage IVB (T2a · N2 · M1c)") — shown
   *  on the diagnosis row when present (from Condition._cancerStage). */
  stage?: string
}
