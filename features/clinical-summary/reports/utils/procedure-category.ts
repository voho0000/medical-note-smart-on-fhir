import type { CodeableConcept } from '@/src/shared/types/fhir.types'

export const BRIDGE_PROCEDURE_CLASSIFICATION_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/procedure-classification'
export const FHIR_PROCEDURE_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/procedure-category'
export const SNOMED_CT_SYSTEM = 'http://snomed.info/sct'
export const SNOMED_SURGICAL_PROCEDURE_CODE = '387713003'

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
 * Surgical procedures may also carry the legacy FHIR procedure-category code
 * or SNOMED CT 387713003, so both are accepted as compatibility fallbacks.
 * Bridge-only categories must still come from the Bridge CodeSystem.
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
  if (fhirSurgicalCoding) return 'surgical-procedure'

  const snomedSurgicalCoding = codings.find((coding) =>
    coding?.system === SNOMED_CT_SYSTEM
    && coding?.code === SNOMED_SURGICAL_PROCEDURE_CODE
  )
  return snomedSurgicalCoding ? 'surgical-procedure' : undefined
}
