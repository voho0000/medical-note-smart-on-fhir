/**
 * FHIR System URLs and Resource Types
 * 
 * Centralized constants to eliminate magic strings and ensure consistency.
 * 
 * Benefits:
 * - Type safety
 * - Easy to update
 * - No typos
 * - Single source of truth
 */

// FHIR Coding Systems
export const FHIR_SYSTEMS = {
  LOINC: 'http://loinc.org',
  SNOMED: 'http://snomed.info/sct',
  ICD10: 'http://hl7.org/fhir/sid/icd-10',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  UCUM: 'http://unitsofmeasure.org',
} as const

// FHIR Resource Types
export const FHIR_RESOURCES = {
  PATIENT: 'Patient',
  CONDITION: 'Condition',
  MEDICATION_REQUEST: 'MedicationRequest',
  MEDICATION_STATEMENT: 'MedicationStatement',
  ALLERGY_INTOLERANCE: 'AllergyIntolerance',
  OBSERVATION: 'Observation',
  DIAGNOSTIC_REPORT: 'DiagnosticReport',
  PROCEDURE: 'Procedure',
  ENCOUNTER: 'Encounter',
} as const

// FHIR Search Parameters
export const FHIR_SEARCH_PARAMS = {
  PATIENT: 'patient',
  SUBJECT: 'subject',
  STATUS: 'status',
  CATEGORY: 'category',
  DATE: 'date',
  CODE: 'code',
} as const

// FHIR Status Values
export const FHIR_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ENTERED_IN_ERROR: 'entered-in-error',
  INACTIVE: 'inactive',
} as const

// Type exports for better TypeScript support
export type FhirSystem = typeof FHIR_SYSTEMS[keyof typeof FHIR_SYSTEMS]
export type FhirResource = typeof FHIR_RESOURCES[keyof typeof FHIR_RESOURCES]
export type FhirSearchParam = typeof FHIR_SEARCH_PARAMS[keyof typeof FHIR_SEARCH_PARAMS]
export type FhirStatus = typeof FHIR_STATUS[keyof typeof FHIR_STATUS]
