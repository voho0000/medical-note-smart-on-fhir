const SDK_UNIT_ORIGIN_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/sdk-unit-origin'

const ADULT_PREVENTIVE_SOURCE_PROGRAM_SYSTEMS = new Set([
  // Bundled / legacy NHI-FHIR Bridge resources.
  'http://nhi-fhir-bridge/source-program',
  // MediCloud adapter (cloud-wildcatch) resources.
  'https://cloud-wildcatch.invalid/fhir/source-program',
])
const ADULT_PREVENTIVE_PROGRAM_CODE = 'adult-preventive'

type TaggedFhirResource = {
  meta?: {
    tag?: Array<{ system?: string; code?: string }>
  }
}

export function isInferredObservationUnit(observation: TaggedFhirResource | null | undefined): boolean {
  return observation?.meta?.tag?.some((tag) =>
    tag.system === SDK_UNIT_ORIGIN_SYSTEM && tag.code === 'bridge-inferred',
  ) ?? false
}

/**
 * Bridge provenance marker for Taiwan's adult preventive health examination.
 * This must remain source-driven: lipid values alone are not enough to infer
 * that a result came from an adult health exam.
 */
export function isAdultPreventiveHealthExamResource(
  resource: TaggedFhirResource | null | undefined,
): boolean {
  return resource?.meta?.tag?.some((tag) =>
    !!tag.system
    && ADULT_PREVENTIVE_SOURCE_PROGRAM_SYSTEMS.has(tag.system)
    && tag.code === ADULT_PREVENTIVE_PROGRAM_CODE,
  ) ?? false
}
