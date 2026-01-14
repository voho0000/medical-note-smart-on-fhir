// Clinical Context Types
// Re-export shared FHIR types to maintain backward compatibility
// Following Single Source of Truth (SSOT) principle
export type {
  CodeableConcept,
  Quantity,
  Observation,
  DiagnosticReport,
  Procedure,
  Condition,
  MedicationRequest,
  AllergyIntolerance
} from '@/src/shared/types/fhir.types'

// Domain-specific type for clinical data collection
export type ClinicalData = {
  conditions?: Array<import('@/src/shared/types/fhir.types').Condition>
  medications?: Array<import('@/src/shared/types/fhir.types').MedicationRequest>
  allergies?: Array<import('@/src/shared/types/fhir.types').AllergyIntolerance>
  diagnosticReports?: Array<import('@/src/shared/types/fhir.types').DiagnosticReport>
  observations?: Array<import('@/src/shared/types/fhir.types').Observation>
  vitalSigns?: Array<import('@/src/shared/types/fhir.types').Observation>
  procedures?: Array<import('@/src/shared/types/fhir.types').Procedure>
}
