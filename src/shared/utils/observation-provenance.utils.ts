const SDK_UNIT_ORIGIN_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/sdk-unit-origin'

export function isInferredObservationUnit(observation: {
  meta?: {
    tag?: Array<{ system?: string; code?: string }>
  }
} | null | undefined): boolean {
  return observation?.meta?.tag?.some((tag) =>
    tag.system === SDK_UNIT_ORIGIN_SYSTEM && tag.code === 'bridge-inferred',
  ) ?? false
}
