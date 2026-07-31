import type { CodeableConcept } from '@/src/shared/types/fhir.types'

export const BRIDGE_PROCEDURE_CLASSIFICATION_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/procedure-classification'
export const FHIR_PROCEDURE_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/procedure-category'

export const PROCEDURE_CATEGORY_CODES = [
  'surgical-procedure',
  'major-procedure',
  'outpatient-treatment',
] as const

export type ProcedureCategoryCode = (typeof PROCEDURE_CATEGORY_CODES)[number]

const PROCEDURE_CATEGORY_CODE_SET = new Set<string>(PROCEDURE_CATEGORY_CODES)

/**
 * Read the source-derived procedure classification emitted by NHI-FHIR-Bridge.
 *
 * Surgical procedures also carry the official FHIR procedure-category coding,
 * so that coding is accepted as a compatibility fallback. Bridge-only
 * categories must come from the Bridge CodeSystem.
 */
export function getProcedureCategoryCode(
  category?: CodeableConcept,
): ProcedureCategoryCode | undefined {
  const codings = Array.isArray(category?.coding) ? category.coding : []

  const bridgeCoding = codings.find((coding) =>
    coding?.system === BRIDGE_PROCEDURE_CLASSIFICATION_SYSTEM
    && PROCEDURE_CATEGORY_CODE_SET.has(coding?.code ?? '')
  )
  if (bridgeCoding?.code) return bridgeCoding.code as ProcedureCategoryCode

  const fhirSurgicalCoding = codings.find((coding) =>
    coding?.system === FHIR_PROCEDURE_CATEGORY_SYSTEM
    && coding?.code === 'surgical-procedure'
  )
  return fhirSurgicalCoding ? 'surgical-procedure' : undefined
}
