const SDK_UNIT_ORIGIN_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/sdk-unit-origin'

const ADULT_PREVENTIVE_SOURCE_PROGRAM_SYSTEMS = new Set([
  // Bundled / legacy NHI-FHIR Bridge resources.
  'http://nhi-fhir-bridge/source-program',
  // MediCloud adapter (cloud-wildcatch) resources.
  'https://cloud-wildcatch.invalid/fhir/source-program',
])
const ADULT_PREVENTIVE_PROGRAM_CODE = 'adult-preventive'

export const NHI_MEDICLOUD_SOURCE_EXTENSION_URL =
  'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system'

const NHI_MEDICLOUD_SOURCE_CODE = 'nhi-medicloud'

type TaggedFhirResource = {
  meta?: {
    tag?: Array<{ system?: string; code?: string }>
  }
}

type ExtendedObservation = TaggedFhirResource & {
  extension?: Array<{
    url?: string
    valueCodeableConcept?: {
      coding?: Array<{ code?: string; display?: string }>
    }
  }>
  performer?: Array<{ display?: string; reference?: string }>
}

/**
 * Exact MediCloud provenance marker supplied on Observation.extension.
 * Display text is intentionally ignored: it is localized, optional, and not a
 * stable machine-readable discriminator.
 */
export function isNhiMedicloudObservation(
  observation: ExtendedObservation | null | undefined,
): boolean {
  return observation?.extension?.some((extension) =>
    extension.url === NHI_MEDICLOUD_SOURCE_EXTENSION_URL
    && extension.valueCodeableConcept?.coding?.some(
      (coding) => coding.code === NHI_MEDICLOUD_SOURCE_CODE,
    ),
  ) ?? false
}

export function isNhiAuthorityDisplay(display: string): boolean {
  const normalized = display.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return /(?:中央健康保險署|健保署|National Health Insurance Administration)/i.test(normalized)
}

/**
 * Original testing institution for a MediCloud Observation, when the source
 * actually supplied one. The NHI authority is the query system's steward, not
 * the laboratory that performed the test, so it must never fill this field.
 */
export function getNhiMedicloudOriginalInstitution(
  observation: ExtendedObservation | null | undefined,
): string | undefined {
  if (!isNhiMedicloudObservation(observation)) return undefined
  return observation?.performer
    ?.map((performer) => performer.display?.trim())
    .find((display): display is string => !!display && !isNhiAuthorityDisplay(display))
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
