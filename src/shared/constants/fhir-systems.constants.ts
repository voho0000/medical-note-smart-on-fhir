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
  // NHI 健保醫令碼 — bridge-emitted code.text mirrors this display (Chinese).
  NHI_MEDICAL_ORDER_CODE: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
  // HIS lab item name (assaY_ITEM_NAME) — the hospital's own short name,
  // usually English ("aTG, (Thyroglobulin Ab)") but occasionally Chinese
  // for legacy entries. Added by NHI-FHIR-Bridge v0.17.4 for no-LOINC labs
  // so we have an English option even when LOINC is absent.
  HIS_LOCAL_LAB: 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab',
} as const

// Substring fragments used for system matching when the host portion of
// the URL may vary across bridge versions. URL constants above are kept
// for canonical references; matching uses .includes(fragment) so URL
// drift doesn't silently break label resolution.
export const FHIR_SYSTEM_FRAGMENTS = {
  LOINC: 'loinc.org',
  NHI_MEDICAL_ORDER_CODE: 'nhi-medical-order-code',
  HIS_LOCAL_LAB: 'his-local-lab',
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
